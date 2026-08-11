# AI Agent Workflow Builder 🤖⚡

An end-to-end full-stack application designed to visual, build, and execute agentic AI workflows. Built with a high-performance Next.js frontend and an asynchronous Node.js backend architecture.


video link : 
https://drive.google.com/file/d/1t-vHY3XD5oECk5ul9Tvzz84Jj_LSTBl3/view?usp=drivesdk
---

## 🌟 Key Features

* **Visual Node-Based Flow Editor:** Drag-and-drop orchestration interface for complex multi-agent execution paths.
* **Component-Driven UI:** Clean, Google-grade design built with Next.js App Router and modular CSS patterns.
* **Asynchronous Execution Backend:** Robust Node.js microservice architecture for managing long-running agent tasks.
* **Containerized Deployment:** Docker Compose integration for seamless local development and isolated service environments.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15+, React 19, CSS Modules, TypeScript |
| **Backend** | Node.js, Express, GraphQL (Apollo Client) |
| **Containerization** | Docker, Docker Compose |
| **Version Control** | Git, GitHub Actions |

---

## 📁 Repository Structure

```text
ai-agent-workflow-builder/
├── backend/               # Node.js API server & agent runner logic
│   ├── server.js          # Entry point
│   └── package.json       # Backend dependencies
├── frontend/              # Next.js frontend client
│   ├── src/               # Application code (App Router, components)
│   └── package.json       # Frontend dependencies
├── docker-compose.yml     # Multi-container orchestration setup
└── README.md              # Project documentation
```
🚀 Quick Start Guide
Prerequisites
Node.js: v18.x or higher
npm: v9.x or higher
Docker & Docker Compose: Optional (for containerized execution)

Option 1: Local Development Setup
Clone the repository:
git clone:(https://github.com/vidyashree-sys/AI_Agent_Workflow_Builder)
cd ai-agent-workflow-builder

Setup and run Backend:
cd backend
npm install
npm start

Setup and run Frontend:
cd ../frontend
npm install
npm run dev

Access Application:
Open http://localhost:3000 in your browser.

Option 2: Docker Compose Setup
Run the full application stack in isolated containers with a single command:
docker-compose up --build

🛡️ Environment Variables
Create a .env file in both frontend and backend directories as needed:

Backend (backend/.env):
PORT=5000
NODE_ENV=development

Frontend (frontend/.env.local):
NEXT_PUBLIC_API_URL=http://localhost:5000
📄 License
Distributed under the MIT License. See LICENSE for more information.


<ElicitationsGroup message="Next steps for your repository:">
  <Elicitation label="Add a LICENSE file to the project" query="Generate a standard MIT License file text for my repository."/>
  <Elicitation label="Set up a GitHub Action CI pipeline" query="Write a GitHub Actions workflow YAML file for building and linting my Next.js and Node.js project."/>
</ElicitationsGroup>
