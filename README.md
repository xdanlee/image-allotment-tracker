# Image Allotment Tracker

A deployable Next.js App Router dashboard for tracking image allotment work across workers. The app uses Vercel for hosting and Google Sheets as the backend. Google credentials are only used in server-side API routes.

## Google Sheet

Create a Google Sheet with a tab named `Data` and this header row in `A1:G1`:

| A | B | C | D | E | F | G |
| --- | --- | --- | --- | --- | --- | --- |
| Worker | Batch No. | File No. | Image Numbers Assigned | WIP | Completed Images | Verified Images |

The queue workflow is:

`Assigned -> WIP -> Completed -> Verified`

When images are moved in the editor, they are removed from all four queue columns in that row first, then added to the selected target queue.

## Google Cloud setup

1. Open Google Cloud Console and create or select a project.
2. Enable the Google Sheets API for that project.
3. Create a service account.
4. Create a JSON key for the service account.
5. Copy the service account email from the JSON key.
6. Share the Google Sheet with that service account email as `Editor`.

## Environment variables

Create `.env.local` for local development:

```bash
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SHEET_TAB=Data
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
DASHBOARD_ADMIN_TOKEN=choose-a-strong-admin-password
```

Do not prefix any secret with `NEXT_PUBLIC_`.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Before shipping changes:

```bash
npm run lint
npm run build
```

## Vercel deployment

1. Push this project to a Git repository.
2. Import the repository in Vercel.
3. Add these environment variables in Vercel Project Settings:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_TAB`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `DASHBOARD_ADMIN_TOKEN`
4. Deploy.

## API

`GET /api/tracker`

Reads `A:G` from the configured Google Sheet tab and returns rows with `sheetRowNumber` included for row-level updates.

`POST /api/tracker`

Requires `x-dashboard-token` to match `DASHBOARD_ADMIN_TOKEN`.

Supported actions:

- `init_headers`: writes the required header row.
- `append_row`: appends one row.
- `update_row`: updates one sheet row in `A:G`.
- `clear_row`: clears one sheet row in `A:G`.

## Known limitation

If two people edit the same row at the same time, the last save wins.
