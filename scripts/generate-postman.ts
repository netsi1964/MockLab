import { parse as parseYaml } from "npm:yaml";
import { schemaInferrer } from "../packages/core/schema-infer.ts";
import { join, basename, extname } from "https://deno.land/std@0.224.0/path/mod.ts";

async function main() {
  let specPath = Deno.args[0] && !Deno.args[0].startsWith("-") ? Deno.args[0] : undefined;

  const projectIndex = Deno.args.indexOf("--project");
  const projectName = projectIndex !== -1 ? Deno.args[projectIndex + 1] : undefined;

  if (projectName) {
    const baseDir = "packages/dashboard-server/projects";
    const yamlPath = join(baseDir, projectName, "openapi.yaml");
    const jsonPath = join(baseDir, projectName, "openapi.json");
    try {
      await Deno.stat(yamlPath);
      specPath = yamlPath;
    } catch {
      try {
        await Deno.stat(jsonPath);
        specPath = jsonPath;
      } catch {
        console.error(`Error: Could not find imported spec for project "${projectName}" in ${yamlPath} or ${jsonPath}`);
        Deno.exit(1);
      }
    }
  }

  if (!specPath) {
    console.error("Usage:\n  deno task generate-postman <spec-file>\n  deno task generate-postman --project <project-name>");
    Deno.exit(1);
  }

  const content = await Deno.readTextFile(specPath);
  const doc = parseYaml(content) as any;

  if (!doc.openapi && !doc.swagger) {
    console.error("Not a valid OpenAPI/Swagger spec");
    Deno.exit(1);
  }

  const title = doc.info?.title ?? "MockLab API";
  const version = doc.info?.version ?? "1.0.0";
  const description = doc.info?.description ?? "";

  const schemas = doc.components?.schemas ?? {};

  function resolveSchema(schema: any): any {
    if (!schema) return schema;
    if (schema.$ref) {
      const name = schema.$ref.split("/").pop();
      if (name && schemas[name]) {
        return resolveSchema(schemas[name]);
      }
    }
    if (schema.properties) {
      const resolvedProps: Record<string, any> = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        resolvedProps[key] = resolveSchema(val);
      }
      return { ...schema, properties: resolvedProps };
    }
    if (schema.items) {
      return { ...schema, items: resolveSchema(schema.items) };
    }
    if (schema.allOf) {
      return {
        ...schema,
        allOf: schema.allOf.map((s: any) => resolveSchema(s))
      };
    }
    if (schema.oneOf) {
      return {
        ...schema,
        oneOf: schema.oneOf.map((s: any) => resolveSchema(s))
      };
    }
    if (schema.anyOf) {
      return {
        ...schema,
        anyOf: schema.anyOf.map((s: any) => resolveSchema(s))
      };
    }
    return schema;
  }

  function getFolderName(path: string): string {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return "General";
    const first = segments[0];
    switch (first.toLowerCase()) {
      case "auth": return "Auth";
      case "companies": return "Company";
      case "crud": return "CRUD";
      case "query": return "Query";
      case "journal": return "Journal";
      case "invoice": return "Invoice";
      case "production": return "Production";
      case "project": return "Project";
      case "master-details": return "MasterDetails";
      default: return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }

  function getHttpStatusText(code: number): string {
    switch (code) {
      case 200: return "OK";
      case 201: return "Created";
      case 202: return "Accepted";
      case 204: return "No Content";
      case 400: return "Bad Request";
      case 401: return "Unauthorized";
      case 403: return "Forbidden";
      case 404: return "Not Found";
      case 500: return "Internal Server Error";
      default: return "OK";
    }
  }

  const folders: Record<string, any[]> = {};
  const paths = doc.paths ?? {};

  for (const [path, pathItem] of Object.entries(paths) as any) {
    for (const [method, operation] of Object.entries(pathItem) as any) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) {
        continue;
      }

      const summary = operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${path}`;
      const opDescription = operation.description ?? "";
      const parameters = operation.parameters ?? [];
      const requestBody = operation.requestBody;
      const responses = operation.responses ?? {};

      const folderName = getFolderName(path);
      if (!folders[folderName]) {
        folders[folderName] = [];
      }

      // Headers
      const headers = [
        {
          "key": "Content-Type",
          "value": "application/json",
          "type": "text"
        },
        {
          "key": "Accept",
          "value": "application/json",
          "type": "text"
        }
      ];

      // Auth Mode
      let auth = null;
      if (path.startsWith("/auth/")) {
        auth = null;
      } else {
        auth = {
          "type": "bearer",
          "bearer": [
            {
              "key": "token",
              "value": "{{accessToken}}",
              "type": "string"
            }
          ]
        };
      }

      // Body
      let body = undefined;
      if (path === "/auth/login") {
        body = {
          "mode": "raw",
          "raw": JSON.stringify({
            "username": "{{username}}",
            "password": "{{password}}",
            "appId": "{{appId}}"
          }, null, 2),
          "options": {
            "raw": {
              "language": "json"
            }
          }
        };
      } else if (requestBody) {
        const content = requestBody.content ?? {};
        const jsonContent = content["application/json"];
        if (jsonContent) {
          const bodySchema = jsonContent.schema;
          if (bodySchema) {
            const resolvedBodySchema = resolveSchema(bodySchema);
            const inferredBody = schemaInferrer.infer(resolvedBodySchema);
            
            // Helper function to recursively replace variables
            const replaceEnvVariables = (obj: any): any => {
              if (obj === null || obj === undefined) return obj;
              if (Array.isArray(obj)) {
                return obj.map(item => replaceEnvVariables(item));
              }
              if (typeof obj === "object") {
                const newObj: Record<string, any> = {};
                for (const [k, v] of Object.entries(obj)) {
                  if (k === "username") newObj[k] = "{{username}}";
                  else if (k === "password") newObj[k] = "{{password}}";
                  else if (k === "refreshToken") newObj[k] = "{{refreshToken}}";
                  else if (k === "accessToken") newObj[k] = "{{accessToken}}";
                  else if (k === "companyId") newObj[k] = "{{companyId}}";
                  else if (k === "appId") newObj[k] = "{{appId}}";
                  else if (k === "entityName") newObj[k] = "{{entityName}}";
                  else if (k === "rowId") newObj[k] = "{{rowId}}";
                  else newObj[k] = replaceEnvVariables(v);
                }
                return newObj;
              }
              return obj;
            };

            const processedBody = replaceEnvVariables(inferredBody);

            body = {
              "mode": "raw",
              "raw": JSON.stringify(processedBody, null, 2),
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            };
          }
        }
      }

      // URL
      let rawUrl = `{{mocklabsBaseUrl}}${path.replace(/\{([^}]+)\}/g, "{{$1}}")}`;
      let pathSegments = path.split("/").filter(Boolean).map((segment: string) => {
        return segment.replace(/\{([^}]+)\}/g, "{{$1}}");
      });

      // Special CRUD mapping as per rule 26
      if (path.startsWith("/query/") || path === "/query") {
        rawUrl = "{{mocklabsBaseUrl}}/Crud/Query/{{entityName}}";
        pathSegments = ["Crud", "Query", "{{entityName}}"];
      } else if (path.startsWith("/crud/")) {
        if (method.toLowerCase() === "get") {
          rawUrl = "{{mocklabsBaseUrl}}/Crud/Read/{{entityName}}";
          pathSegments = ["Crud", "Read", "{{entityName}}"];
        } else if (method.toLowerCase() === "post") {
          rawUrl = "{{mocklabsBaseUrl}}/Crud/Update/{{entityName}}";
          pathSegments = ["Crud", "Update", "{{entityName}}"];
        } else if (method.toLowerCase() === "put") {
          rawUrl = "{{mocklabsBaseUrl}}/Crud/Update/{{entityName}}";
          pathSegments = ["Crud", "Update", "{{entityName}}"];
        } else if (method.toLowerCase() === "delete") {
          rawUrl = "{{mocklabsBaseUrl}}/Crud/Delete/{{entityName}}";
          pathSegments = ["Crud", "Delete", "{{entityName}}"];
        }
      }

      const queryParams = [];
      for (const param of parameters) {
        if (param.in === "query") {
          let val = `{{${param.name}}}`;
          if (param.name === "companyId") val = "{{companyId}}";
          else if (param.name === "appId") val = "{{appId}}";
          else if (param.name === "entityName") val = "{{entityName}}";
          else if (param.name === "rowId") val = "{{rowId}}";

          queryParams.push({
            "key": param.name,
            "value": val,
            "description": param.description ?? ""
          });
        }
      }

      const url = {
        "raw": rawUrl,
        "host": ["{{mocklabsBaseUrl}}"],
        "path": pathSegments,
        "query": queryParams.length > 0 ? queryParams : undefined
      };

      // Scripts
      const event = [];
      if (path === "/auth/login") {
        event.push({
          "listen": "test",
          "script": {
            "type": "text/javascript",
            "exec": [
              "const json = pm.response.json();",
              "",
              "if (json.accessToken) {",
              "  pm.environment.set(\"accessToken\", json.accessToken);",
              "}",
              "",
              "if (json.refreshToken) {",
              "  pm.environment.set(\"refreshToken\", json.refreshToken);",
              "}"
            ]
          }
        });
      }

      // Saved Examples
      const savedResponses = [];
      for (const [code, respObj] of Object.entries(responses) as any) {
        const statusCode = Number(code);
        if (isNaN(statusCode)) continue;

        const respContent = respObj.content ?? {};
        const respJson = respContent["application/json"];
        if (respJson) {
          const respSchema = respJson.schema;
          if (respSchema) {
            const resolvedRespSchema = resolveSchema(respSchema);
            const inferredResp = schemaInferrer.infer(resolvedRespSchema);

            savedResponses.push({
              "name": respObj.description ?? `Response ${statusCode}`,
              "originalRequest": {
                "method": method.toUpperCase(),
                "header": headers,
                "body": body,
                "url": url
              },
              "status": getHttpStatusText(statusCode),
              "code": statusCode,
              "_postman_previewlanguage": "json",
              "header": [
                {
                  "key": "Content-Type",
                  "value": "application/json"
                }
              ],
              "body": JSON.stringify(inferredResp, null, 2)
            });
          }
        }
      }

      folders[folderName].push({
        "name": summary,
        "event": event.length > 0 ? event : undefined,
        "request": {
          "auth": auth,
          "method": method.toUpperCase(),
          "header": headers,
          "body": body,
          "url": url,
          "description": opDescription
        },
        "response": savedResponses
      });
    }
  }

  // Construct item list with folders sorted alphabetically
  const items = Object.entries(folders).sort(([a], [b]) => a.localeCompare(b)).map(([folderName, folderItems]) => {
    return {
      "name": folderName,
      "item": folderItems
    };
  });

  const collection = {
    "info": {
      "_postman_id": crypto.randomUUID(),
      "name": title,
      "description": description,
      "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "item": items
  };

  const outputDir = "postman";
  await Deno.mkdir(outputDir, { recursive: true });
  
  const baseName = projectName 
    ? projectName 
    : basename(specPath, extname(specPath));

  const collectionFilename = `${baseName}.json`;
  const collectionPath = join(outputDir, collectionFilename);
  await Deno.writeTextFile(collectionPath, JSON.stringify(collection, null, 2));
  console.log(`Saved Postman Collection to ${collectionPath}`);

  // Construct environment
  const environment = {
    "id": crypto.randomUUID(),
    "name": baseName.toLowerCase() === "uniconta" ? "MockLab Uniconta" : `MockLab ${baseName.charAt(0).toUpperCase() + baseName.slice(1)}`,
    "values": [
      {
        "key": "mocklabsBaseUrl",
        "value": "http://localhost:4010",
        "type": "default",
        "enabled": true,
        "description": "The URL of the running MockLab project runtime."
      },
      {
        "key": "username",
        "value": "admin",
        "type": "default",
        "enabled": true,
        "description": "Test username used in the login payload."
      },
      {
        "key": "password",
        "value": "secret123",
        "type": "default",
        "enabled": true,
        "description": "Test password used in the login payload."
      },
      {
        "key": "companyId",
        "value": "1",
        "type": "default",
        "enabled": true,
        "description": "Default company identifier."
      },
      {
        "key": "appId",
        "value": "mock-app",
        "type": "default",
        "enabled": true,
        "description": "Application ID used in mock contexts."
      },
      {
        "key": "entityName",
        "value": "Debtor",
        "type": "default",
        "enabled": true,
        "description": "Default entity type for CRUD requests."
      },
      {
        "key": "rowId",
        "value": "1",
        "type": "default",
        "enabled": true,
        "description": "Default ID used for entity lookups, updates, and deletes."
      },
      {
        "key": "accessToken",
        "value": "",
        "type": "default",
        "enabled": true,
        "description": "Automatically populated by login test scripts."
      },
      {
        "key": "refreshToken",
        "value": "",
        "type": "default",
        "enabled": true,
        "description": "Automatically populated by login test scripts."
      }
    ],
    "_postman_variable_scope": "environment",
    "_postman_exported_at": new Date().toISOString(),
    "_postman_exported_using": "Postman/10.0.0"
  };

  const envFilename = `${baseName}-environment.json`;
  const envPath = join(outputDir, envFilename);
  await Deno.writeTextFile(envPath, JSON.stringify(environment, null, 2));
  console.log(`Saved Postman Environment to ${envPath}`);
}

if (import.meta.main) {
  await main();
}
