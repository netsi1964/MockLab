# OpenAPI Specs

Place your OpenAPI 3.x YAML or JSON files here before importing them into MockLab.

## Usage

```bash
# Import by filename (MockLab looks here automatically)
mocklab import my-service.yaml --project my-service

# Or use a full path to import from anywhere
mocklab import /some/other/path/openapi.json --project my-service
```

Files in this folder are not modified by MockLab — your originals stay here.
After import, a copy is saved inside the project folder as `openapi.yaml` or
`openapi.json`, depending on the imported file type.

`uniconta.json` is the official Swagger/OpenAPI document downloaded from
`https://api.uniconta.com/swagger/v1/swagger.json`.
The older hand-written mock spec is preserved as `uniconta.yaml.old`.
