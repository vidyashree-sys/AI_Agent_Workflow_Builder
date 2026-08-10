'use client';

import { useState } from 'react';
import { gql } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import styles from './dashboard.module.css';

interface Organization {
  id: string;
  name: string;
  quota_allowed: number;
  quota_used: number;
}

interface WorkflowStep {
  id: string;
  step_order: number;
  type: string;
  config: Record<string, unknown>;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  workflow_steps: WorkflowStep[];
}

interface StepRun {
  id: string;
  status: string;
  output: Record<string, unknown>;
  workflow_step: {
    step_order: number;
    type: string;
  };
}

interface WorkflowRun {
  id: string;
  status: string;
  created_at: string;
  step_runs: StepRun[];
}

interface DashboardData {
  organizations: Organization[];
  workflows: Workflow[];
  workflow_runs: WorkflowRun[];
}

const GET_DASHBOARD_DATA = gql`
  query GetDashboardData {
    organizations {
      id
      name
      quota_allowed
      quota_used
    }
    workflows {
      id
      name
      description
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        config
      }
    }
    workflow_runs(order_by: { created_at: desc }, limit: 10) {
      id
      status
      created_at
      step_runs(order_by: { created_at: asc }) {
        id
        status
        output
        workflow_step {
          step_order
          type
        }
      }
    }
  }
`;

const TRIGGER_WORKFLOW = gql`
  mutation TriggerWorkflow($workflow_id: String!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      run_id
      status
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: String!) {
    approveStep(step_run_id: $step_run_id) {
      success
      message
    }
  }
`;

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'live' | 'logs'>('live');
  
  const ORG_A_USER_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
  const ORG_B_USER_ID = 'bbbbbbbb-2222-2222-2222-222222222222';

  const [activeUser, setActiveUser] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('demo_user_id') || ORG_A_USER_ID;
    }
    return ORG_A_USER_ID;
  });

  const handleUserChange = (userId: string) => {
    localStorage.setItem('demo_user_id', userId);
    setActiveUser(userId);
    window.location.reload();
  };

  const { data, loading, error, refetch } = useQuery<DashboardData>(GET_DASHBOARD_DATA, {
    pollInterval: 3000,
    context: {
      headers: {
        'x-hasura-user-id': activeUser,
        'x-hasura-role': 'user',
      },
    },
  });

  const [triggerWorkflow] = useMutation(TRIGGER_WORKFLOW);
  const [approveStep] = useMutation(APPROVE_STEP);
  const [actionLoading, setActionLoading] = useState(false);

  const handleTrigger = async (workflowId: string) => {
    setActionLoading(true);
    try {
      await triggerWorkflow({
        variables: { workflow_id: workflowId },
        context: {
          headers: {
            'x-hasura-user-id': activeUser,
            'x-hasura-role': 'user',
          },
        },
      });
      refetch();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      alert(`Execution Failed: ${errorMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (stepRunId: string) => {
    setActionLoading(true);
    try {
      await approveStep({
        variables: { step_run_id: stepRunId },
        context: {
          headers: {
            'x-hasura-user-id': activeUser,
            'x-hasura-role': 'user',
          },
        },
      });
      refetch();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      alert(`Approval Failed: ${errorMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) return <div className={styles.container}>Loading Workflow Engine...</div>;
  if (error) return <div className={styles.container} style={{ color: '#ef4444' }}>Error: {error.message}</div>;

  const isOrgA = activeUser === ORG_A_USER_ID;
  const targetOrgId = isOrgA 
    ? '11111111-1111-1111-1111-111111111111' 
    : '22222222-2222-2222-2222-222222222222';

  const rawOrg = data?.organizations?.find((o) => o.id === targetOrgId) || data?.organizations?.[0];

  const org = rawOrg
    ? {
        ...rawOrg,
        name: isOrgA ? 'Wayne Enterprises (Org A)' : 'Stark Industries (Org B)',
      }
    : null;

  const workflows = data?.workflows || [];
  const runs = data?.workflow_runs || [];
  const completedRuns = runs.filter((r) => r.status === 'completed');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'paused': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#3b82f6';
    }
  };

  const getUniqueStepRuns = (stepRuns: StepRun[]) => {
    if (!stepRuns) return [];
    const seen = new Set<number>();
    return stepRuns.filter((sr) => {
      const stepOrder = sr.workflow_step?.step_order;
      if (stepOrder !== undefined && !seen.has(stepOrder)) {
        seen.add(stepOrder);
        return true;
      }
      return false;
    });
  };

  return (
    <div className={styles.container}>
      {/* Top Navigation */}
      <header className={styles.brandHeader}>
        <div>
          <h1 className={styles.brandTitle}>AI Agent Workflow Platform</h1>
          <p className={styles.brandSub}>Orchestrate, execution tracking & manual approval gates</p>
        </div>
        <select 
          value={activeUser} 
          onChange={(e) => handleUserChange(e.target.value)}
          className={styles.selectInput}
        >
          <option value={ORG_A_USER_ID}>Org A - Owner (Wayne Enterprises)</option>
          <option value={ORG_B_USER_ID}>Org B - Owner (Stark Industries)</option>
        </select>
      </header>

      {/* Quota Meter */}
      {org && (
        <div className={styles.card}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#f8fafc' }}>{org.name}</h2>
          <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
            Quota: <strong style={{ color: '#f1f5f9' }}>{org.quota_used}</strong> / {org.quota_allowed} runs consumed
          </div>
          <div className={styles.progressBarTrack}>
            <div 
              className={styles.progressBarFill}
              style={{ 
                width: `${Math.min((org.quota_used / org.quota_allowed) * 100, 100)}%`,
                backgroundColor: org.quota_used >= org.quota_allowed ? '#ef4444' : '#22c55e'
              }} 
            />
          </div>
        </div>
      )}

      {/* Available Workflows */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 className={styles.sectionTitle}>Available Workflows</h2>
        {workflows.length === 0 ? (
          <p className={styles.emptyState}>No workflows registered for this organization.</p>
        ) : (
          workflows.map((wf) => (
            <div key={wf.id} className={styles.workflowItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>{wf.name}</h3>
                <p style={{ margin: '0.2rem 0', fontSize: '0.875rem', color: '#94a3b8' }}>{wf.description}</p>
                <small style={{ color: '#64748b' }}>
                  Steps: llm_call → http_request → conditional_branch → approval_gate
                </small>
              </div>

              {/* Live Execution Trigger Button */}
              <button 
                onClick={() => handleTrigger(wf.id)} 
                disabled={actionLoading || (org ? org.quota_used >= org.quota_allowed : false)}
                style={{
                  padding: '0.65rem 1.25rem',
                  backgroundColor: (org && org.quota_used >= org.quota_allowed) ? '#475569' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: (org && org.quota_used >= org.quota_allowed) ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
              >
                {actionLoading ? 'Triggering...' : '▶ Run Workflow'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Tabs Header */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #334155', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setActiveTab('live')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'live' ? '#60a5fa' : '#94a3b8',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'live' ? '2px solid #60a5fa' : 'none',
            paddingBottom: '0.5rem'
          }}
        >
          Live Executions
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'logs' ? '#60a5fa' : '#94a3b8',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'logs' ? '2px solid #60a5fa' : 'none',
            paddingBottom: '0.5rem'
          }}
        >
          Approved Execution Logs ({completedRuns.length})
        </button>
      </div>

      {/* Live Executions View */}
      {activeTab === 'live' && (
        <div>
          {runs.length === 0 ? (
            <p className={styles.emptyState}>No active execution pipelines.</p>
          ) : (
            runs.map((run) => {
              const uniqueSteps = getUniqueStepRuns(run.step_runs);
              return (
                <div key={run.id} className={styles.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                      Run ID: {run.id}
                    </span>
                    <span 
                      className={styles.statusBadge}
                      style={{ backgroundColor: getStatusColor(run.status) }}
                    >
                      {run.status.toUpperCase()}
                    </span>
                  </div>

                  <div className={styles.timelineGrid}>
                    {uniqueSteps.map((sr) => (
                      <div key={sr.id} className={styles.stepCard}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>
                          Step {sr.workflow_step?.step_order}: {sr.workflow_step?.type}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          Status: <strong style={{ color: getStatusColor(sr.status) }}>{sr.status}</strong>
                        </div>

                        {sr.status === 'paused' && sr.workflow_step?.type === 'approval_gate' && (
                          <button 
                            onClick={() => handleApprove(sr.id)}
                            disabled={actionLoading}
                            className={styles.approveButton}
                          >
                            Approve & Resume
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Execution Logs View */}
      {activeTab === 'logs' && (
        <div>
          {completedRuns.length === 0 ? (
            <p className={styles.emptyState}>No completed or approved executions logged.</p>
          ) : (
            <div className={styles.card} style={{ padding: '0.5rem', overflowX: 'auto' }}>
              <table className={styles.tableContainer}>
                <thead>
                  <tr>
                    <th>Execution ID</th>
                    <th>Created At</th>
                    <th>Steps Executed</th>
                    <th>Final State</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRuns.map((cr) => (
                    <tr key={cr.id}>
                      <td style={{ fontFamily: 'monospace' }}>{cr.id}</td>
                      <td>{new Date(cr.created_at).toLocaleString()}</td>
                      <td>{getUniqueStepRuns(cr.step_runs)?.length || 0} Steps</td>
                      <td>
                        <span className={styles.statusBadge} style={{ backgroundColor: '#22c55e' }}>
                          COMPLETED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}