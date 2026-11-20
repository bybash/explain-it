/**
 * The worked example in the authoring guide: a small flow told the way the
 * guide advises, using every kind of action. A test parses it with the
 * schemas, so it stays valid.
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
    { id: "set_password", from: "user", to: "app", label: "new password" },
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
            { type: "appear", node: "app" },
            { type: "flow", edge: "ask" },
          ],
        },
        {
          id: "find",
          caption: "The app finds their account.",
          say: "The app looks the account up by email address.",
          actions: [
            { type: "appear", node: "users" },
            { type: "flow", edge: "lookup" },
            { type: "highlight", node: "users" },
          ],
        },
        {
          id: "link",
          caption: "A one-time link goes out by email.",
          say: "It sends a link that works once, and only for an hour.",
          actions: [
            { type: "appear", node: "mailer" },
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
          id: "email",
          caption: "The link arrives in their inbox.",
          say: "The email reaches the user a moment later.",
          actions: [{ type: "flow", edge: "deliver" }],
        },
        {
          id: "done",
          caption: "They choose a new password and are back in.",
          say: "The link opens a page in the app, where they choose a new password and are signed in.",
          actions: [
            { type: "dim", except: ["user", "app"] },
            { type: "flow", edge: "set_password" },
            { type: "badge", node: "user", text: "signed in", tone: "ok" },
          ],
        },
      ],
    },
  ],
} as const;
