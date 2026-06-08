# Local Secrets

This folder is for local-only deployment credentials.

Use `secrets/mapbox.env` for the real Mapbox secret token. That file is ignored by Git and should not be committed.

Start from `secrets/mapbox.env.example`:

```powershell
Copy-Item .\secrets\mapbox.env.example .\secrets\mapbox.env
```

Then paste the real token into `secrets/mapbox.env`:

```text
MAPBOX_SECRET_TOKEN=sk.your_token_here
MAPBOX_USERNAME=lickergeospatial
```

Use a Mapbox secret token with the scopes needed for tileset uploads.
