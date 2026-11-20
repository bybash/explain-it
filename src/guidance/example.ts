/**
 * The worked example in the authoring guide: a small flow that uses every
 * kind of action once. A test parses it with the schemas, so it stays valid.
 */

export const EXAMPLE_GRAPH = {
  version: 1,
  title: "Resetting a password",
  nodes: [
    { id: "user", label: "User", kind: "actor", icon: "user" },
    { id: "app", label: "Web app", kind: "service", icon: "app-window", zone: "backend" },
    { id: "users", label: "Users", kind: "database", icon: "database", zone: "backend" },
    { id: "mailer", label: "Email service", kind: "external", icon: "mail" },
  ],
  edges: [
    { id: "ask", from: "user", to: "app", label: "Forgot password" },
    { id: "lookup", from: "app", to: "users", label: "find the account" },
    { id: "send_link", from: "app", to: "mailer", label: "reset link" },
    { id: "deliver", from: "mailer", to: "user", label: "email" },
  ],
  zones: [{ id: "backend", label: "Your app" }],
} as const;

export const EXAMPLE_STORYBOARD = {
  version: 1,
  scenes: [
    {
      id: "reset",
      title: "Reset",
      nodes: ["user", "app", "users", "mailer"],
      beats: [
        {
          id: "forgot",
          caption: "The user has forgotten their password.",
          say: "Someone can't remember their password, so they ask the app for help.",
          actions: [
            { type: "appear", node: "user" },
            { type: "flow", edge: "ask" },
          ],
        },
        {
          id: "find",
          caption: "The app finds their account.",
          say: "The app looks up the account by email address.",
          actions: [
            { type: "flow", edge: "lookup" },
            { type: "highlight", node: "users" },
          ],
        },
        {
          id: "link",
          caption: "A one-time link goes out by email.",
          say: "It sends a link that works once, and only for an hour.",
          actions: [
            { type: "flow", edge: "send_link" },
            {
              type: "callout",
              node: "mailer",
              title: "One-time link",
              text: "Expires after an hour or one use.",
            },
          ],
        },
        {
          id: "done",
          caption: "The link opens a page to choose a new password.",
          say: "The user follows the link and picks a new password.",
          actions: [
            { type: "flow", edge: "deliver" },
            { type: "dim", except: ["user", "mailer"] },
            { type: "badge", node: "user", text: "reset", tone: "ok" },
          ],
        },
      ],
    },
  ],
} as const;
