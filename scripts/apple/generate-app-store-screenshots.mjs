import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = path.join(repoRoot, "artifacts", "app-store", "screenshots", "en-US");
const logoPath = path.join(repoRoot, "apps", "mobile", "assets", "icons", "icon.png");

const COLORS = {
  background: "#071426",
  canvas: "#0B192D",
  panel: "#101F34",
  panelStrong: "#14263F",
  line: "#2B3D56",
  white: "#F7F9FC",
  muted: "#9BAAC0",
  orange: "#FF7A1A",
  green: "#34D399",
  cyan: "#22D3EE",
};

const scenes = [
  {
    slug: "01-workspace-overview",
    eyebrow: "ONE CLEAR WORKSPACE",
    title: ["Manage your messaging", "from one workspace"],
    subtitle: "See connected accounts, groups, contacts, and delivery activity at a glance.",
    kind: "dashboard",
  },
  {
    slug: "02-account-connection",
    eyebrow: "ACCOUNT CONNECTION",
    title: ["Connect and monitor", "your WhatsApp account"],
    subtitle: "Use an account you own and keep its connection state visible.",
    kind: "accounts",
  },
  {
    slug: "03-groups-and-contacts",
    eyebrow: "ORGANIZED TARGETS",
    title: ["Organize groups and", "synchronized contacts"],
    subtitle: "Search, categorize, and select the audiences available to your workspace.",
    kind: "targets",
  },
  {
    slug: "04-message-scheduling",
    eyebrow: "FLEXIBLE DELIVERY",
    title: ["Send now, schedule,", "or repeat messages"],
    subtitle: "Prepare a message, choose an audience, and select the delivery time.",
    kind: "composer",
  },
  {
    slug: "05-team-and-support",
    eyebrow: "CONTROLLED ACCESS",
    title: ["Manage team access", "and support requests"],
    subtitle: "Keep workspace roles, invitations, and support conversations in one place.",
    kind: "team",
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function text(x, y, value, size, options = {}) {
  const weight = options.weight || 500;
  const fill = options.fill || COLORS.white;
  const anchor = options.anchor || "start";
  const family = options.family || "Arial, Helvetica, sans-serif";
  const letterSpacing = options.letterSpacing || 0;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${family}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`;
}

function roundedRect(x, y, width, height, radius, fill, stroke = "none", strokeWidth = 0) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function divider(x, y, width) {
  return `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${COLORS.line}" stroke-width="2"/>`;
}

function pill(x, y, width, label, tone = "orange", height = 54, fontSize = 25) {
  const background = tone === "green" ? "#123B34" : tone === "muted" ? "#1D3048" : "#4B2A1B";
  const foreground = tone === "green" ? "#6EE7B7" : tone === "muted" ? COLORS.muted : "#FFB46E";
  return [
    roundedRect(x, y, width, height, height / 2, background),
    text(x + width / 2, y + height * 0.66, label, fontSize, {
      weight: 700,
      fill: foreground,
      anchor: "middle",
    }),
  ].join("");
}

function check(x, y, scale = 1) {
  return `<path d="M ${x} ${y + 9 * scale} L ${x + 8 * scale} ${y + 17 * scale} L ${x + 23 * scale} ${y}" fill="none" stroke="${COLORS.green}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function statCard(x, y, width, height, label, value, accent = COLORS.orange) {
  return [
    roundedRect(x, y, width, height, 26, COLORS.panelStrong, COLORS.line, 2),
    `<circle cx="${x + 42}" cy="${y + 42}" r="13" fill="${accent}"/>`,
    text(x + 34, y + 101, label, 24, { fill: COLORS.muted }),
    text(x + 34, y + 158, value, 44, { weight: 700 }),
  ].join("");
}

function mobileHeader(x, y, width, logoData) {
  return [
    `<image href="${logoData}" x="${x + 30}" y="${y + 26}" width="76" height="76"/>`,
    text(x + 126, y + 75, "Logivya", 34, { weight: 700 }),
    roundedRect(x + width - 94, y + 31, 60, 60, 18, COLORS.panelStrong, COLORS.line, 2),
    `<line x1="${x + width - 76}" y1="${y + 51}" x2="${x + width - 52}" y2="${y + 51}" stroke="${COLORS.white}" stroke-width="4" stroke-linecap="round"/>`,
    `<line x1="${x + width - 76}" y1="${y + 61}" x2="${x + width - 52}" y2="${y + 61}" stroke="${COLORS.white}" stroke-width="4" stroke-linecap="round"/>`,
    `<line x1="${x + width - 76}" y1="${y + 71}" x2="${x + width - 52}" y2="${y + 71}" stroke="${COLORS.white}" stroke-width="4" stroke-linecap="round"/>`,
    divider(x, y + 116, width),
  ].join("");
}

function renderDashboard(x, y, width, height, logoData, scale = 1) {
  const gap = 22 * scale;
  const cardWidth = (width - 64 * scale - gap) / 2;
  return [
    mobileHeader(x, y, width, logoData),
    text(x + 32 * scale, y + 175 * scale, "Good morning", 28 * scale, { fill: COLORS.muted }),
    text(x + 32 * scale, y + 226 * scale, "Workspace overview", 40 * scale, { weight: 700 }),
    statCard(x + 32 * scale, y + 276 * scale, cardWidth, 190 * scale, "Connected accounts", "1", COLORS.green),
    statCard(x + 32 * scale + cardWidth + gap, y + 276 * scale, cardWidth, 190 * scale, "Groups and contacts", "24 / 320", COLORS.cyan),
    statCard(x + 32 * scale, y + 488 * scale, cardWidth, 190 * scale, "Sent this month", "66", COLORS.orange),
    statCard(x + 32 * scale + cardWidth + gap, y + 488 * scale, cardWidth, 190 * scale, "Failed messages", "0", COLORS.green),
    roundedRect(x + 32 * scale, y + 710 * scale, width - 64 * scale, 176 * scale, 26 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 60 * scale, y + 766 * scale, "Connection status", 25 * scale, { fill: COLORS.muted }),
    text(x + 60 * scale, y + 820 * scale, "Messaging account", 30 * scale, { weight: 700 }),
    pill(x + width - 196 * scale, y + 760 * scale, 136 * scale, "Connected", "green", 54 * scale, 22 * scale),
    text(x + 60 * scale, y + 862 * scale, "Ready for group and contact workflows", 22 * scale, { fill: COLORS.muted }),
  ].join("");
}

function renderAccounts(x, y, width, height, logoData, scale = 1) {
  return [
    mobileHeader(x, y, width, logoData),
    text(x + 32 * scale, y + 181 * scale, "WhatsApp accounts", 40 * scale, { weight: 700 }),
    text(x + 32 * scale, y + 225 * scale, "Accounts connected by this workspace", 23 * scale, { fill: COLORS.muted }),
    roundedRect(x + 32 * scale, y + 272 * scale, width - 64 * scale, 386 * scale, 28 * scale, COLORS.panelStrong, COLORS.line, 2),
    `<circle cx="${x + 92 * scale}" cy="${y + 340 * scale}" r="${29 * scale}" fill="#1A503F"/>`,
    check(x + 79 * scale, y + 330 * scale, scale),
    text(x + 142 * scale, y + 335 * scale, "Messaging account", 31 * scale, { weight: 700 }),
    text(x + 142 * scale, y + 375 * scale, "+90 555 000 00 00", 23 * scale, { fill: COLORS.muted }),
    pill(x + 60 * scale, y + 422 * scale, 150 * scale, "Connected", "green", 54 * scale, 22 * scale),
    text(x + 60 * scale, y + 520 * scale, "Connected groups", 23 * scale, { fill: COLORS.muted }),
    text(x + 60 * scale, y + 575 * scale, "24", 44 * scale, { weight: 700 }),
    roundedRect(x + 60 * scale, y + 598 * scale, 238 * scale, 58 * scale, 18 * scale, COLORS.orange),
    text(x + 179 * scale, y + 636 * scale, "Reconnect", 23 * scale, { weight: 700, anchor: "middle", fill: COLORS.background }),
    roundedRect(x + 32 * scale, y + 700 * scale, width - 64 * scale, 185 * scale, 26 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 60 * scale, y + 755 * scale, "Connection privacy", 27 * scale, { weight: 700 }),
    text(x + 60 * scale, y + 800 * scale, "Only accounts authorized by your workspace", 22 * scale, { fill: COLORS.muted }),
    text(x + 60 * scale, y + 837 * scale, "are displayed in this view.", 22 * scale, { fill: COLORS.muted }),
  ].join("");
}

function renderTargets(x, y, width, height, logoData, scale = 1) {
  const rows = [
    ["Operations Team", "12 participants"],
    ["Dispatch Updates", "38 participants"],
    ["Customer Updates", "Category - 86 contacts"],
    ["Service Contacts", "Category - 42 contacts"],
  ];
  const rowHeight = 116 * scale;
  let rowMarkup = "";
  rows.forEach(([name, detail], index) => {
    const rowY = y + (384 + index * 132) * scale;
    rowMarkup += roundedRect(x + 32 * scale, rowY, width - 64 * scale, rowHeight, 22 * scale, COLORS.panelStrong, COLORS.line, 2);
    rowMarkup += roundedRect(x + 58 * scale, rowY + 33 * scale, 42 * scale, 42 * scale, 10 * scale, COLORS.panelStrong, COLORS.muted, 3);
    rowMarkup += text(x + 126 * scale, rowY + 49 * scale, name, 27 * scale, { weight: 700 });
    rowMarkup += text(x + 126 * scale, rowY + 82 * scale, detail, 21 * scale, { fill: COLORS.muted });
  });
  return [
    mobileHeader(x, y, width, logoData),
    text(x + 32 * scale, y + 181 * scale, "Groups and contacts", 40 * scale, { weight: 700 }),
    roundedRect(x + 32 * scale, y + 230 * scale, width - 64 * scale, 86 * scale, 22 * scale, COLORS.panelStrong, COLORS.line, 2),
    `<circle cx="${x + 72 * scale}" cy="${y + 273 * scale}" r="${15 * scale}" fill="none" stroke="${COLORS.muted}" stroke-width="${4 * scale}"/>`,
    `<line x1="${x + 82 * scale}" y1="${y + 284 * scale}" x2="${x + 94 * scale}" y2="${y + 296 * scale}" stroke="${COLORS.muted}" stroke-width="${4 * scale}" stroke-linecap="round"/>`,
    text(x + 118 * scale, y + 282 * scale, "Search groups or contacts", 24 * scale, { fill: COLORS.muted }),
    pill(x + 32 * scale, y + 330 * scale, 138 * scale, "Groups", "orange", 48 * scale, 21 * scale),
    pill(x + 180 * scale, y + 330 * scale, 150 * scale, "Contacts", "muted", 48 * scale, 21 * scale),
    rowMarkup,
  ].join("");
}

function renderComposer(x, y, width, height, logoData, scale = 1) {
  return [
    mobileHeader(x, y, width, logoData),
    text(x + 32 * scale, y + 181 * scale, "Create message", 40 * scale, { weight: 700 }),
    roundedRect(x + 32 * scale, y + 225 * scale, width - 64 * scale, 190 * scale, 24 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 58 * scale, y + 278 * scale, "Message", 22 * scale, { fill: COLORS.muted }),
    text(x + 58 * scale, y + 328 * scale, "Your service update is ready.", 26 * scale, { weight: 600 }),
    text(x + 58 * scale, y + 367 * scale, "Thank you for staying connected.", 24 * scale, { fill: COLORS.muted }),
    pill(x + 32 * scale, y + 447 * scale, 164 * scale, "Send now", "muted", 54 * scale, 21 * scale),
    pill(x + 208 * scale, y + 447 * scale, 152 * scale, "Schedule", "orange", 54 * scale, 21 * scale),
    pill(x + 372 * scale, y + 447 * scale, 136 * scale, "Repeat", "muted", 54 * scale, 21 * scale),
    roundedRect(x + 32 * scale, y + 535 * scale, width - 64 * scale, 92 * scale, 22 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 58 * scale, y + 570 * scale, "Date and time", 21 * scale, { fill: COLORS.muted }),
    text(x + 58 * scale, y + 610 * scale, "24.07.2026  19:20", 27 * scale, { weight: 700 }),
    roundedRect(x + 32 * scale, y + 659 * scale, width - 64 * scale, 150 * scale, 22 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 58 * scale, y + 704 * scale, "Audience", 21 * scale, { fill: COLORS.muted }),
    text(x + 58 * scale, y + 750 * scale, "Operations Team", 28 * scale, { weight: 700 }),
    text(x + 58 * scale, y + 785 * scale, "12 participants", 21 * scale, { fill: COLORS.muted }),
    roundedRect(x + 32 * scale, y + 842 * scale, width - 64 * scale, 72 * scale, 22 * scale, COLORS.orange),
    text(x + width / 2, y + 888 * scale, "Schedule message", 25 * scale, { weight: 700, anchor: "middle", fill: COLORS.background }),
  ].join("");
}

function renderTeam(x, y, width, height, logoData, scale = 1) {
  const members = [
    ["Workspace owner", "Owner"],
    ["Operations user", "Member"],
    ["Support user", "Member"],
  ];
  let memberMarkup = "";
  members.forEach(([name, role], index) => {
    const rowY = y + (338 + index * 116) * scale;
    memberMarkup += roundedRect(x + 32 * scale, rowY, width - 64 * scale, 98 * scale, 20 * scale, COLORS.panelStrong, COLORS.line, 2);
    memberMarkup += `<circle cx="${x + 80 * scale}" cy="${rowY + 49 * scale}" r="${24 * scale}" fill="${index === 0 ? COLORS.orange : COLORS.cyan}"/>`;
    memberMarkup += text(x + 120 * scale, rowY + 43 * scale, name, 25 * scale, { weight: 700 });
    memberMarkup += text(x + 120 * scale, rowY + 73 * scale, role, 20 * scale, { fill: COLORS.muted });
  });
  return [
    mobileHeader(x, y, width, logoData),
    text(x + 32 * scale, y + 181 * scale, "Team and support", 40 * scale, { weight: 700 }),
    roundedRect(x + 32 * scale, y + 224 * scale, width - 64 * scale, 82 * scale, 22 * scale, COLORS.orange),
    text(x + 58 * scale, y + 274 * scale, "Invite a team member", 25 * scale, { weight: 700, fill: COLORS.background }),
    memberMarkup,
    roundedRect(x + 32 * scale, y + 710 * scale, width - 64 * scale, 182 * scale, 24 * scale, COLORS.panelStrong, COLORS.line, 2),
    text(x + 58 * scale, y + 760 * scale, "Support request", 27 * scale, { weight: 700 }),
    text(x + 58 * scale, y + 802 * scale, "Connection assistance", 23 * scale),
    pill(x + width - 174 * scale, y + 774 * scale, 114 * scale, "Open", "green", 48 * scale, 20 * scale),
    text(x + 58 * scale, y + 849 * scale, "Follow replies in the same conversation.", 21 * scale, { fill: COLORS.muted }),
  ].join("");
}

function renderScene(scene, device, logoData) {
  const { width, height } = device;
  const isTablet = device.kind === "ipad";
  const outer = isTablet ? 104 : 72;
  const top = isTablet ? 116 : 96;
  const titleSize = isTablet ? 72 : 63;
  const eyebrowSize = isTablet ? 25 : 22;
  const subtitleSize = isTablet ? 31 : 28;
  const appX = isTablet ? 126 : 78;
  const appY = isTablet ? 780 : 710;
  const appWidth = isTablet ? width - 252 : width - 156;
  const appHeight = height - appY + 96;
  const mockScale = isTablet ? 1.38 : 1.08;
  const mockWidth = isTablet ? appWidth - 100 : appWidth;
  const mockX = isTablet ? appX + 50 : appX;
  const mockY = appY + (isTablet ? 48 : 0);

  const titleLines = scene.title
    .map((line, index) => text(width / 2, top + 110 + index * (titleSize + 10), line, titleSize, {
      anchor: "middle",
      weight: 700,
    }))
    .join("");

  const subtitleY = top + 110 + scene.title.length * (titleSize + 10) + 42;
  const renderer = {
    dashboard: renderDashboard,
    accounts: renderAccounts,
    targets: renderTargets,
    composer: renderComposer,
    team: renderTeam,
  }[scene.kind];

  const mockContent = renderer(mockX, mockY, mockWidth, appHeight, logoData, mockScale);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${COLORS.background}"/>
      <rect x="${outer}" y="${top - 34}" width="${width - outer * 2}" height="5" rx="2.5" fill="${COLORS.orange}"/>
      ${text(width / 2, top + 35, scene.eyebrow, eyebrowSize, {
        anchor: "middle",
        weight: 700,
        fill: COLORS.orange,
        letterSpacing: 3,
      })}
      ${titleLines}
      ${text(width / 2, subtitleY, scene.subtitle, subtitleSize, {
        anchor: "middle",
        weight: 400,
        fill: COLORS.muted,
      })}
      ${roundedRect(appX, appY, appWidth, appHeight, isTablet ? 52 : 44, COLORS.canvas, COLORS.line, 3)}
      ${mockContent}
    </svg>`;
}

async function writeScreenshot(scene, device, logoData) {
  const directory = path.join(outputRoot, device.directory);
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${scene.slug}.png`);
  const svg = renderScene(scene, device, logoData);
  await sharp(Buffer.from(svg))
    .flatten({ background: COLORS.background })
    .toColourspace("srgb")
    .png({ compressionLevel: 9, palette: false })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.width !== device.width || metadata.height !== device.height || metadata.hasAlpha) {
    throw new Error(`Invalid screenshot output: ${outputPath}`);
  }
  return outputPath;
}

async function main() {
  const logo = await readFile(logoPath);
  const logoData = `data:image/png;base64,${logo.toString("base64")}`;
  const devices = [
    { kind: "iphone", directory: "iphone-6.5", width: 1284, height: 2778 },
    { kind: "iphone", directory: "iphone-6.9", width: 1320, height: 2868 },
    { kind: "ipad", directory: "ipad-13", width: 2064, height: 2752 },
  ];

  const outputs = [];
  for (const device of devices) {
    for (const scene of scenes) {
      outputs.push(await writeScreenshot(scene, device, logoData));
    }
  }

  console.log(JSON.stringify({
    outputRoot,
    screenshots: outputs.map((file) => path.relative(repoRoot, file).replaceAll("\\", "/")),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
