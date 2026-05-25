# OpenAPI Specs

Place your OpenAPI 3.x YAML or JSON files here before importing them into MockLab.

## Usage

```bash
# Import by filename (MockLab looks here automatically)
mocklab import my-service.yaml --project my-service

# Or use a full path to import from anywhere
mocklab import /some/other/path/openapi.yaml --project my-service
```

Files in this folder are not modified by MockLab — your originals stay here.
After import, a copy is saved inside the project folder (`projects/<name>/openapi.yaml`).
