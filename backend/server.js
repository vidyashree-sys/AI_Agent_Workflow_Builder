const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || 'myadminsecret';

// Helper function to execute GraphQL Admin Requests
async function hasuraAdminQuery(query, variables = {}) {
  const response = await axios.post(
    HASURA_GRAPHQL_URL,
    { query, variables },
    { 
      headers: { 
        'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
        'x-hasura-role': 'admin'
      } 
    }
  );
  return response.data;
}

// -----------------------------------------------------------------------------
// ACTION HANDLER 1: triggerWorkflowRun
// -----------------------------------------------------------------------------
app.post('/api/trigger-workflow', async (req, res) => {
  try {
    const { workflow_id } = req.body.input;
    const sessionVars = req.body.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'];

    if (!userId) {
      return res.status(400).json({ message: 'Missing X-Hasura-User-Id in session variables' });
    }

    // Fetch Workflow, Org Members, and Steps
    const fetchQuery = `
      query GetWorkflowDetails($workflow_id: uuid!) {
        workflows_by_pk(id: $workflow_id) {
          id
          org_id
          organization {
            quota_allowed
            quota_used
            org_members {
              user_id
              role
            }
          }
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }
    `;

    const data = await hasuraAdminQuery(fetchQuery, { workflow_id });
    
    console.log("--- HASURA FETCH WORKFLOW RESPONSE ---");
    console.log(JSON.stringify(data, null, 2));

    const workflow = data?.data?.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found in database' });
    }

    // Check if requesting user belongs to the org with sufficient role
    const member = workflow.organization?.org_members?.find(m => m.user_id === userId);
    if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions to trigger this workflow' });
    }

    // Quota Check
    if (workflow.organization.quota_used >= workflow.organization.quota_allowed) {
      return res.status(400).json({ message: 'Organization quota exhausted for this period' });
    }

    // Create Workflow Run Row
    const createRunMutation = `
      mutation CreateRun($workflow_id: uuid!, $triggered_by: uuid!) {
        insert_workflow_runs_one(object: { workflow_id: $workflow_id, triggered_by: $triggered_by, status: "running" }) {
          id
        }
      }
    `;
    const runRes = await hasuraAdminQuery(createRunMutation, { workflow_id, triggered_by: userId });
    const runId = runRes.data.insert_workflow_runs_one.id;

    // Start execution asynchronously
    executeSteps(runId, workflow.workflow_steps, 0, {});

    return res.json({ run_id: runId, status: 'running' });
  } catch (err) {
    console.error("Trigger Workflow Error:", err);
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SECONDARY TRIGGER: Webhook Inbound Endpoint
// -----------------------------------------------------------------------------
app.post('/api/webhook/trigger/:workflow_id', async (req, res) => {
  try {
    const { workflow_id } = req.params;

    const fetchQuery = `
      query GetWorkflowForWebhook($workflow_id: uuid!) {
        workflows_by_pk(id: $workflow_id) {
          id
          org_id
          organization {
            quota_allowed
            quota_used
            org_members(where: { role: { _eq: "owner" } }) {
              user_id
            }
          }
          workflow_steps(order_by: { step_order: asc }) {
            id
            step_order
            type
            config
          }
        }
      }
    `;

    const data = await hasuraAdminQuery(fetchQuery, { workflow_id });
    const workflow = data?.data?.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow target not found' });
    }

    if (workflow.organization.quota_used >= workflow.organization.quota_allowed) {
      return res.status(400).json({ error: 'Organization quota depleted' });
    }

    const systemUserId = workflow.organization.org_members[0]?.user_id;

    const createRunMutation = `
      mutation CreateWebhookRun($workflow_id: uuid!, $triggered_by: uuid) {
        insert_workflow_runs_one(object: { 
          workflow_id: $workflow_id, 
          triggered_by: $triggered_by, 
          trigger_type: "webhook", 
          status: "running" 
        }) {
          id
        }
      }
    `;
    const runRes = await hasuraAdminQuery(createRunMutation, { workflow_id, triggered_by: systemUserId });
    const runId = runRes.data.insert_workflow_runs_one.id;

    executeSteps(runId, workflow.workflow_steps, 0, req.body || {});

    return res.json({ success: true, run_id: runId, trigger: 'webhook' });
  } catch (err) {
    console.error('Webhook trigger error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// EXECUTION ENGINE: Step Sequencer & Execution Logic
// -----------------------------------------------------------------------------
async function executeSteps(runId, steps, startIndex = 0, initialContext = {}) {
  let context = { ...initialContext };

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];

    // Create Step Run Record
    const createStepRun = `
      mutation CreateStepRun($runId: uuid!, $stepId: uuid!, $input: jsonb) {
        insert_step_runs_one(object: { workflow_run_id: $runId, workflow_step_id: $stepId, status: "running", input: $input }) {
          id
        }
      }
    `;
    const stepRunRes = await hasuraAdminQuery(createStepRun, { runId, stepId: step.id, input: context });
    const stepRunId = stepRunRes.data.insert_step_runs_one.id;

    // Handle APPROVAL GATE Steps
    if (step.type === 'approval_gate') {
      await hasuraAdminQuery(`
        mutation PauseRun($runId: uuid!, $stepRunId: uuid!) {
          update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "paused" }) { id }
          update_step_runs_by_pk(pk_columns: { id: $stepRunId }, _set: { status: "paused" }) { id }
        }
      `, { runId, stepRunId });
      return; // Stop execution until approved
    }

    // Step Execution Logic
    let output = {};
    let status = 'completed';
    let errorMsg = null;

    try {
      if (step.type === 'llm_call') {
        output = { response: `[AI Simulated Response] Generated text for prompt: "${step.config?.prompt || 'Hello'}"` };
      } else if (step.type === 'http_request') {
        output = { statusCode: 200, data: "Mocked HTTP Response Data" };
      } else if (step.type === 'conditional_branch') {
        output = { conditionPassed: true, branch: "then" };
      } else {
        output = { executed: true };
      }
    } catch (err) {
      status = 'failed';
      errorMsg = err.message;
    }

    // Update Step Run Record
    await hasuraAdminQuery(`
      mutation CompleteStepRun($stepRunId: uuid!, $status: step_status!, $output: jsonb, $error: String) {
        update_step_runs_by_pk(pk_columns: { id: $stepRunId }, _set: { status: $status, output: $output, error: $error }) { id }
      }
    `, { stepRunId, status, output, error: errorMsg });

    if (status === 'failed') {
      await hasuraAdminQuery(`
        mutation FailRun($runId: uuid!) {
          update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "failed" }) { id }
        }
      `, { runId });
      return;
    }

    context[`step_${step.step_order}`] = output;
  }

  // Mark Run as Completed & Increment Quota
  await hasuraAdminQuery(`
    mutation FinalizeRun($runId: uuid!) {
      update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "completed", completed_at: "now()" }) {
        workflow { org_id }
      }
    }
  `, { runId });
}

// -----------------------------------------------------------------------------
// ACTION HANDLER 2: approveStep
// -----------------------------------------------------------------------------
app.post('/api/approve-step', async (req, res) => {
  try {
    const { step_run_id } = req.body.input;
    const sessionVars = req.body.session_variables || {};
    const userId = sessionVars['x-hasura-user-id'];

    const fetchDetails = `
      query GetStepRunDetails($step_run_id: uuid!, $userId: uuid!) {
        step_runs_by_pk(id: $step_run_id) {
          id
          workflow_run_id
          workflow_run {
            workflow {
              organization {
                org_members(where: { user_id: { _eq: $userId } }) {
                  role
                }
              }
              workflow_steps(order_by: { step_order: asc }) {
                id
                step_order
                type
                config
              }
            }
          }
        }
      }
    `;

    const data = await hasuraAdminQuery(fetchDetails, { step_run_id, userId });
    const stepRun = data?.data?.step_runs_by_pk;

    if (!stepRun) {
      return res.status(404).json({ message: 'Step run not found' });
    }

    // Role check
    const role = stepRun.workflow_run.workflow.organization.org_members[0]?.role;
    if (!role || (role !== 'owner' && role !== 'editor')) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions to approve this step' });
    }

    // Approve Step & Resume Workflow
    await hasuraAdminQuery(`
      mutation ApproveStepRun($step_run_id: uuid!, $userId: uuid!, $runId: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $step_run_id }, _set: { status: "completed", approved_by: $userId, approved_at: "now()" }) { id }
        update_workflow_runs_by_pk(pk_columns: { id: $runId }, _set: { status: "running" }) { id }
      }
    `, { step_run_id, userId, runId: stepRun.workflow_run_id });

    // Resume execution from step following approval gate
    const steps = stepRun.workflow_run.workflow.workflow_steps;
    const approvedStepIndex = steps.findIndex(s => s.type === 'approval_gate');
    executeSteps(stepRun.workflow_run_id, steps, approvedStepIndex + 1, {});

    return res.json({ success: true, message: 'Step approved, workflow resumed' });
  } catch (err) {
    console.error("Approve Step Error:", err);
    return res.status(500).json({ message: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Workflow Execution Engine listening on port ${PORT}`));