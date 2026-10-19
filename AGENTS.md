# Source synchronization

This is the Railway-hosted Melvin HQ interface, replacing the old application in the existing `alldesignsolution-boop/melvin-gan-carpentry` repository. Preserve repository history and push verified changes to main before deployment. Verify the Railway deployment's commit matches the pushed commit.

Target project: 4db6c91a-0cb4-4704-b39b-fb72dfaa656d. Environment: 8249e7e8-ce7f-4197-accd-d02e10cfc421. Service: 8a80b35f-9c90-4256-ba8a-87ae16220cb4. Preserve its existing /app/data volume and old data. The new portal does not write to that volume.

The existing owner-private Sites application remains the authoritative HQ data store and hourly ingestion destination. The Railway server authenticates Melvin using the existing server-side admin account, then accesses only the allowlisted HQ UI endpoints using independent server credentials. Never expose credentials, customer records or database backups in source, logs or browser assets. Do not enable unauthenticated proxy access, forward browser identity headers or proxy ingestion/service endpoints. Keep source UI changes synchronized with the Sites version deliberately.
