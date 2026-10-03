// Dependency-free static exporter for the public Staza landing page.
//
// Renders the English and German landing documents from the checked-in
// template using the existing localization renderer, then stages only the
// files the landing pages reference. No application server is deployed and no
// npm install or compilation step is required: the renderer is a pure
// TypeScript module imported with Node's native type stripping (Node >= 22.18).
//
// Usage:
//   node scripts/export-landing.mjs [outputDir]
//
// The resolved staging directory is printed on the final stdout line so a
// caller (such as a GitHub Actions workflow) can capture it.

import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const publicDirectory = path.join(repositoryRoot, "public");
const landingSource = path.join(publicDirectory, "landing");
const assetsSource = path.join(publicDirectory, "assets");

// Shared assets referenced by absolute `/assets/...` URLs in the template.
const sharedAssets = ["favicon.svg", "logo-full.svg"];

const locales = [
  { locale: "en", relativePath: "index.html" },
  { locale: "de", relativePath: path.join("de", "index.html") }
];

const localReferences = (source) =>
  [...source.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => /\.(svg|jpg|jpeg|png|webp|css|js)$/.test(reference));

const assertNoUnresolvedPlaceholders = (html, locale) => {
  const unresolved = [...html.matchAll(/\{\{\s*landing\.[^}]*\}\}/g)].map((match) => match[0]);
  if (unresolved.length > 0) {
    throw new Error(
      `Unresolved placeholders in the ${locale} landing page: ${[...new Set(unresolved)].join(", ")}`
    );
  }
};

const resolveStagingDirectory = async (requested) => {
  if (requested) {
    const absolute = path.resolve(requested);
    await rm(absolute, { recursive: true, force: true });
    await mkdir(absolute, { recursive: true });
    return absolute;
  }
  const base = process.env.RUNNER_TEMP ?? os.tmpdir();
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, "landing-stage-"));
};

const main = async () => {
  const { translateLandingTemplate } = await import(
    path.join(repositoryRoot, "src", "landing", "locales.ts")
  );

  const template = await readFile(path.join(landingSource, "index.html"), "utf8");

  const staging = await resolveStagingDirectory(process.argv[2] ?? process.env.LANDING_STAGING_DIR);

  // Render each locale and verify it is fully localized before staging.
  const renderedDocuments = [];
  for (const { locale, relativePath } of locales) {
    const rendered = translateLandingTemplate(template, locale);
    assertNoUnresolvedPlaceholders(rendered, locale);
    const destination = path.join(staging, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, rendered, "utf8");
    renderedDocuments.push({ relativePath, html: rendered });
  }

  // Stage the landing supporting files (landing.css, landing.js, assets/).
  // Exclude the template index.html: the localized pages are rendered to the
  // staging root and the raw template still contains placeholders.
  const templateDocument = path.join(landingSource, "index.html");
  await cp(landingSource, path.join(staging, "landing"), {
    recursive: true,
    filter: (source) => path.resolve(source) !== templateDocument
  });

  // Stage only the shared assets explicitly referenced by the template.
  const stagedAssets = path.join(staging, "assets");
  await mkdir(stagedAssets, { recursive: true });
  for (const asset of sharedAssets) {
    const from = path.join(assetsSource, asset);
    if (!existsSync(from)) {
      throw new Error(`Referenced shared asset is missing from public/assets: ${asset}`);
    }
    await cp(from, path.join(stagedAssets, asset));
  }

  // Add Apache directory-index settings at the webroot, readable by the host.
  const htaccess = path.join(staging, ".htaccess");
  await writeFile(htaccess, await readFile(path.join(repositoryRoot, "scripts", "landing.htaccess")), {
    mode: 0o644
  });
  await chmod(htaccess, 0o644);

  // Verify every local URL dependency referenced by the rendered pages exists
  // inside the staged artifact.
  const missing = new Set();
  let checkedReferences = 0;
  for (const { html } of renderedDocuments) {
    for (const reference of localReferences(html)) {
      checkedReferences += 1;
      const staged = path.join(staging, reference.replace(/^\//, ""));
      if (!existsSync(staged)) {
        missing.add(reference);
      }
    }
  }
  if (missing.size > 0) {
    throw new Error(`Staged artifact is missing referenced files: ${[...missing].join(", ")}`);
  }
  if (checkedReferences === 0) {
    throw new Error("No local asset references were found in the rendered landing pages.");
  }
  if (!existsSync(htaccess)) {
    throw new Error("Staged artifact is missing its Apache .htaccess file.");
  }

  process.stdout.write(`Staged landing artifact at ${staging}\n`);
  process.stdout.write(`${staging}\n`);
};

main().catch((error) => {
  process.stderr.write(`export-landing failed: ${error.message}\n`);
  process.exit(1);
});
