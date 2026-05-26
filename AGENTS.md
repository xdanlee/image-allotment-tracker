Project goal:
Build and maintain a production-ready image allotment tracker using Next.js, Vercel, and Google Sheets.

Rules:
- Use JavaScript, not TypeScript.
- Use App Router.
- Keep Google Sheets credentials server-side only.
- Never expose secrets with NEXT_PUBLIC.
- Use Tailwind CSS for UI.
- Keep dependencies minimal.
- Do not add shadcn/ui unless explicitly requested.
- Do not add framer-motion unless explicitly requested.
- Do not use localStorage for production data.
- Do not use SQLite for this version.
- Always run lint/build after changes.
- Remove unused imports, unused functions, and obsolete prototype logic.
- The app must preserve this queue workflow:
  Assigned -> WIP -> Completed -> Verified.
- Moving image numbers must remove them from all queue columns first, then add them to the target queue.
