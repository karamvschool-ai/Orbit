# Orbit

A standalone personal assistant frontend, carefully modeled on the supplied reference. The singularity has a pure black face, luminous outer rim, continuously waving ribbons, orbiting particles and satellites, and an elastic silhouette that pushes away from your cursor.

## Run

Requires Node.js 18 or newer. No dependencies or installation required.

```sh
npm run dev
```

Open http://localhost:5173. Run `npm run build` to generate the static site in `dist/`, and `npm run preview` to preview the build.

## Frontend interactions

- Submit text to play a local response and progress animation.
- Toggle the microphone to preview the listening appearance. It does not record audio or request microphone access.
- Browse conversations, preview workspace files, and adjust animation and cursor gravity through the left menu.
- Add local file names to the workspace, mark tasks complete, hide and restore the tasks panel, and copy the displayed response.
- Press `/` to focus the composer and `Escape` to dismiss panels.

All assistant responses and tasks are illustrative. This version has no AI service, backend, accounts, file upload, or scheduled execution. File contents stay untouched. Animation respects the system’s reduced-motion preference.
