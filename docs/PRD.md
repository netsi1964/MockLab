# PRD.md — MockLab

## Product Name

MockLab (working title)

## Summary

MockLab is an open source developer tool for rapidly spinning up configurable mock API environments from OpenAPI specifications.

The product enables developers to:

* import OpenAPI YAML specifications
* auto-generate realistic mock APIs
* customize endpoint behavior at runtime
* manage multiple mock projects
* inspect request traffic
* simulate failures, latency, and auth scenarios
* control mocks via UI, CLI, and MCP server

Primary use cases:

* integration testing
* frontend development before backend readiness
* simulating third-party dependencies
* AI-assisted API simulation workflows

---

## Problem Statement

Developers frequently need mock APIs for integration tests, frontend development, failure simulation, unstable dependency emulation, and exploratory testing.

Existing tools are fragmented:

* OpenAPI mockers generate static mocks
* runtime configurability is limited
* admin UIs are often weak or absent
* multi-project workflows are clumsy
* AI/chat-based control is rare

MockLab provides a configurable control plane over existing mock runtime technology.

---

## Goals

### 1. OpenAPI-first mocking

Given an OpenAPI YAML file, MockLab generates a runnable mock API environment.

### 2. Runtime configurability

Users can change endpoint behavior without restarting.

Examples:

* return 401 instead of 200
* inject 2500ms delay
* return malformed responses
* simulate flaky endpoints
* disable endpoints
* override payloads

### 3. Multi-project support

Users can manage multiple isolated mock API projects.

Example:

```
/projects
  /crm-api
    openapi.yaml
    endpoints.json
    faker.ts
  /erp-api
    openapi.yaml
    endpoints.json
    faker.ts
```

### 4. Auto-generated admin dashboard

Visual management of all mock environments.

### 5. AI controllability

Expose MCP server tools for chat/agent control.

### 6. Persistence

Changes from UI, CLI, or MCP persist to disk.

---

## Non-goals (v1)

Not in scope:

* production traffic replay
* distributed cloud deployment
* GraphQL mocking
* SOAP mocking
* full OAuth provider emulation
* contract testing platform

---

## Target Users

### Primary

Individual developers (especially backend/fullstack developers).

### Secondary

* frontend developers
* QA engineers
* consultants
* AI-assisted development workflows

---

## User Stories

### Project Management

As a developer, I want multiple isolated mock projects so configs do not collide.

### OpenAPI Import

As a developer, I want to import an OpenAPI YAML so endpoints are generated automatically.

### Endpoint Configuration

As a developer, I want to configure endpoint behavior to simulate real-world scenarios.

### Dashboard

As a developer, I want a UI so I do not need to edit JSON manually.

### Faker Overrides

As a developer, I want generated faker scripts so I can customize payload generation.

Example:

```ts
export function generateUser() {
  return {
    id: faker.number.int(),
    name: faker.person.fullName(),
    email: faker.internet.email()
  };
}
```

### MCP

As a developer, I want an MCP server so AI agents can control mock behavior.

---

## Functional Requirements

### Project Structure

```
/mocklab
  /projects
    /crm-api
      openapi.yaml
      endpoints.json
      faker.ts
      stats.json
      overrides/
```

### OpenAPI Processing

System shall:

* parse OpenAPI 3.x YAML
* discover endpoints
* discover schemas
* infer mock payloads
* generate faker templates
* generate endpoint config

Generated files:

* `endpoints.json`
* `faker.ts`

### endpoints.json Example

```json
{
  "project": {
    "name": "crm-api",
    "port": 4010,
    "host": "localhost"
  },
  "endpoints": [
    {
      "path": "/users",
      "method": "GET",
      "enabled": true,
      "defaultStatus": 200,
      "currentStatus": 200,
      "delayMs": 0,
      "authMode": "none",
      "failureMode": "none",
      "fakerHandler": "generateUsers",
      "overrideResponse": null,
      "stats": {
        "requestCount": 0,
        "lastCalled": null,
        "avgResponseTimeMs": 0
      }
    }
  ]
}
```

### Runtime Features

Per endpoint:

* configurable response codes
* configurable delay
* enable/disable
* static override payload
* faker-generated payload
* aggregate request stats in `endpoints.json`
* detailed request/response traffic in project-local `traffic.har` files

`traffic.har` is a runtime artifact and must not be committed. It uses HAR 1.2
so request/response history can be inspected or exported using standard tooling,
while endpoint configuration remains cleanly separated in `endpoints.json`.
* auth simulation
* random failure injection
* malformed payload mode
* request logging
* statistics tracking

Global:

* port override
* host override
* reset stats
* import/export config

---

## Admin Dashboard

### Global

* project selector
* create/import project
* delete project
* start/stop project
* edit global config
* view server health

### Endpoint Management

Per endpoint:

* method
* path
* enabled toggle
* delay editor
* status selector
* auth mode selector
* payload editor
* faker toggle
* stats view
* recent requests

---

## CLI

```
mocklab init
mocklab import ./openapi.yaml
mocklab run crm-api
mocklab list
mocklab reset crm-api
mocklab export crm-api
```

---

## MCP Server

### Project Tools

* `list_projects`
* `get_project`
* `create_project`
* `switch_project`

### Endpoint Tools

* `list_endpoints`
* `update_endpoint`
* `reset_endpoint`
* `inject_failure`
* `disable_endpoint`

### Stats Tools

* `get_stats`
* `reset_stats`

---

## Architecture

### Core Components

#### OpenAPI Parser

Candidates:

* swagger-parser
* openapi-types
* yaml

#### Mock Runtime

Preferred candidates:

* Prism
* Mockoon runtime
* openapi-backend

Design requirement:
Use runtime adapter abstraction from day one.

#### Dashboard Backend

Preferred:

* Hono

#### Frontend

Preferred:

* React
* Vite
* shadcn/ui

#### Faker Generation

Preferred:

* faker-js

#### MCP Server

Preferred:

* official MCP TypeScript SDK

---

## Technical Constraints

Must:

* run locally
* be open source
* support Deno
* persist config to disk
* support hot reload
* leverage existing npm-compatible tooling

---

## Risks

### Runtime rigidity

Some mock engines may not support live mutation cleanly.
Mitigation: runtime adapter abstraction.

### Schema complexity

Complex OpenAPI schemas may generate poor mocks.
Mitigation: manual faker overrides.

### Concurrent state edits

UI + CLI + MCP may race.
Mitigation: centralized config service + file locking.

---

## Success Criteria (v1)

Success if MockLab can:

* import OpenAPI YAML
* generate working mock API
* edit endpoint behavior live
* persist changes
* support multiple projects
* provide dashboard
* expose MCP controls
* generate usable fake payloads

---

## Future Ideas (v2+)

* scenario presets
* record/replay mode
* webhook simulation
* OpenTelemetry export
* Docker packaging
* team collaboration
* hosted cloud mode
* GraphQL support

---

## Recommended MVP Strategy

### Phase 1

* OpenAPI import
* endpoints.json generation
* faker.ts generation
* runtime abstraction
* dashboard
* persistence

### Phase 2

* MCP server

### Phase 3

* advanced simulation modes

---

## Recommended Stack

Deno + TypeScript + Hono + React + faker + MCP SDK + pluggable runtime adapter.
