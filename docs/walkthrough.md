# MockLab — Implementeringsgennemgang

## Hvad blev bygget

Hele MockLab codebase er implementeret som et Deno mono-repo workspace med 5 packages.

---

## Filstruktur

```
/mocklab
  deno.json                          # Workspace root
  README.md
  /packages
    /core                            # ✅ Færdig
      types.ts                       # Alle delte TypeScript typer
      config-service.ts              # Centraliseret læs/skriv med mutex
      project-manager.ts             # Opret/list/slet projekter
      openapi-parser.ts              # OpenAPI 3.x YAML/JSON parser
      schema-infer.ts                # Infer statiske mock-værdier fra schemas
      faker-generator.ts             # Generér faker.ts filer fra OpenAPI schemas
      stats-tracker.ts               # Request-statistik og request-log
      import-service.ts              # Orkestrer hele import-pipelinen
      mod.ts                         # Barrel export
      tests/
        fixtures/petstore.yaml       # Test fixture
        core_test.ts                 # 17 unit tests ✅ 17/17 passed

    /runtime                         # ✅ Færdig
      mock-server.ts                 # Built-in Hono mock server (no Prism)
      runtime-manager.ts             # Multi-project livecyklus manager
      mod.ts

    /dashboard-server                # ✅ Færdig
      main.ts                        # Hono server entry (port 8080)
      routes/
        projects.ts                  # CRUD + import/start/stop/export
        endpoints.ts                 # List/update/reset/stats

    /dashboard-ui                    # ✅ Færdig (Vite build med lyst/mørkt tema ✅)
      src/
        main.tsx                     # React + QueryClient + Router entry
        App.tsx                      # Routes: /projects, /projects/:name
        api.ts                       # Typed API client
        index.css                    # Komplet design system (light/dark theme support)
        components/
          Layout.tsx                 # Top bar med status og lyst/mørkt tema toggle
        pages/
          ProjectsPage.tsx           # Project cards, create, import modal
          ProjectDetailPage.tsx      # Endpoint list + split config panel

    /cli                             # ✅ Færdig
      main.ts                        # 9 kommandoer: init/list/create/import/run/stop/reset/export/delete

    /mcp                             # ✅ Færdig
      main.ts                        # 13 MCP tools via stdio transport
```

---

## Test resultater

```
ok | 17 passed | 0 failed (14ms)
```

- OpenApiParser: parser Petstore, $ref resolution, method inference, version check
- SchemaInferrer: string/number/boolean/object/array/enum/format/null
- FakerGenerator: TypeScript generation, unique handlers, path-based names

Vite build: **298.5 kB JS + 8.5 kB CSS** ✅

---

## Sådan starter du

### 1. Start dashboard server
```bash
deno task dev --cwd packages/dashboard-server
```
Åbner på `http://localhost:8080`

### 2. Brug CLI
```bash
deno run --allow-all packages/cli/main.ts init
deno run --allow-all packages/cli/main.ts create crm-api
deno run --allow-all packages/cli/main.ts import ./openapi.yaml --project crm-api
deno run --allow-all packages/cli/main.ts run crm-api
```

### 3. Start React UI (dev mode)
```bash
cd packages/dashboard-ui && npm run dev
```
Åbner på `http://localhost:5173`

### 4. MCP server (Claude Desktop)
```json
{
  "mcpServers": {
    "mocklab": {
      "command": "deno",
      "args": ["run", "--allow-all", "/path/to/packages/mcp/main.ts"]
    }
  }
}
```

---

## Arkitektoniske highlights

### Built-in mock server
Requests går direkte til en Hono-server der kører inde i Deno-processen:

```
Client → MockLab Built-in Server (:4010)
         ↓ re-læser endpoints.json
         ↓ auth check → delay → failure injection → response
         ↓
         Client
```

Fordele vs. Prism:
- **Ingen Node.js / npx** påkrævet
- **Live config**: endpoints.json re-læses ved hvert request — ingen restart
- **Hurtig opstart**: < 100ms vs. Prisms 5-30 sekunder
- **Ingen subprocess**: ingen zombie-processer eller port-konflikter

### Mutex-baseret fil-locking
`config-service.ts` bruger en in-memory per-project mutex der serialiserer concurrent writes til `endpoints.json`. Brug af atomisk temp-file + rename for at undgå korruption.

### Faker adapter-mønster
`faker.ts` genereres én gang ved import og indeholder TypeScript-funktioner der kan redigeres frit. Handlers registreres i et `handlers` map som runtime-laget bruger til dispatch.

### Stateful Mock Database & UI
`state.json` styres nu fuldt ud dynamisk fra dashboardet via en flot og detaljeret **Database State** tab:
- **Hono Endpoints**: `/api/projects/:name/state` (GET, PUT) og `/api/projects/:name/state/reset` (POST).
- **Insight / Analytics**: Viser samlet antal records, antal collections (f.eks. `Debtor`), registrerede `companies` og cached endpoints i et flot grid-layout.
- **Editor**: Et custom-kodet JSON editor-felt med real-time syntaksvalidering (grøn/rød badge + præcis parser-fejlbesked), en "Format Document"-knap til formatering, og en "Reset State"-knap med bekræftelsestilstand.
- **Click-to-Scroll**: Klik på en samling i venstre side (f.eks. "Debtor" eller "companies") for at fokusere, markere og auto-scrolle JSON-editoren direkte ned til den pågældende sektion.

### Real-time Request Logger & Inspector
Hvert endpoint understøtter nu detaljeret visning af ankomne API-kald:
- **Realtids-opdatering**: Dashboard UI poller projekt-data hvert 2. sekund, så du ser nye anmodninger, gennemsnitlig svartid og tællere med det samme uden genindlæsning.
- **Udvidbare logs (Request Inspector)**: Klik på en anmodning i "Requests"-fanen for at udvide og inspicere rå anmodnings-headers og request-body (payload) direkte i UI.

---

## Næste skridt

- [x] End-to-end test: import Petstore, start server, verificér responses
- [x] Compile CLI til standalone binary (`deno compile`)
- [x] Vite proxy-config til dev-mode (sæt `/api` til at proxie til :8080)
- [x] Stateful mock database UI/UX dashboard
- [x] Real-time request logging & headers/body inspection i UI
- [ ] WebSocket-baseret live stat-opdatering i UI (i stedet for polling)
- [ ] Scenario-presets (v2)
