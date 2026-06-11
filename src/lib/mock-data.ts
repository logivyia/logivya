export const accounts = [
  { name: "Dispatch Line", phone: "+90 532 440 18 82", groups: 84, contacts: 1420, status: "Connected", sync: "2 min ago" },
  { name: "Sales Network", phone: "+90 533 102 67 44", groups: 31, contacts: 608, status: "Connected", sync: "18 min ago" },
  { name: "Partner Desk", phone: "+90 535 880 10 12", groups: 12, contacts: 204, status: "Disconnected", sync: "Yesterday" },
];

export const categories = [
  { name: "EU Routes", color: "#36d399", groups: 24, audience: 1860 },
  { name: "Domestic Carriers", color: "#69a7ff", groups: 38, audience: 2740 },
  { name: "Priority Partners", color: "#c487ff", groups: 12, audience: 690 },
  { name: "Customer Updates", color: "#ffb45c", groups: 19, audience: 1120 },
];

export const campaigns = [
  { title: "Istanbul → Berlin / Refrigerated", status: "Completed", sent: 42, failed: 1, total: 43, time: "Today, 14:32" },
  { title: "Weekly truck availability", status: "Sending", sent: 28, failed: 0, total: 74, time: "Today, 13:05" },
  { title: "Port delay announcement", status: "Partially completed", sent: 17, failed: 3, total: 20, time: "Yesterday, 18:44" },
  { title: "New partner onboarding", status: "Scheduled", sent: 0, failed: 0, total: 12, time: "Tomorrow, 09:00" },
];

export const groups = [
  { name: "Europe Freight Network", account: "Dispatch Line", members: 486, category: "EU Routes", send: true },
  { name: "TR ↔ DE Logistics", account: "Dispatch Line", members: 312, category: "EU Routes", send: true },
  { name: "Domestic Load Board", account: "Sales Network", members: 728, category: "Domestic Carriers", send: true },
  { name: "Verified Fleet Owners", account: "Sales Network", members: 244, category: "Priority Partners", send: true },
  { name: "Black Sea Operations", account: "Partner Desk", members: 196, category: "Uncategorized", send: false },
];
