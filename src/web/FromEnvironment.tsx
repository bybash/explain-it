/** Says that the environment sets a setting, which then cannot be changed in the app. */
export const FromEnvironment = ({ variable }: { readonly variable: string }) => (
  <p className="text-muted text-sm">
    Set by <code>{variable}</code> in the environment, which wins over <code>.env</code>.
  </p>
);
