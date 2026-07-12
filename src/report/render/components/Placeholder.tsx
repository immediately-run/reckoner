// The unknown-component placeholder (§3.3): a document may name a component this app doesn't
// provide (a fork's component, a newer catalog entry). It renders a visible, explanatory
// block — never a page-killing error, never silent omission — which is also the fork story:
// component *usages* are content, so a document degrades gracefully in stock Reckoner.
export default function Placeholder({ name }: { name: string }) {
  return (
    <div className="rk-placeholder" role="note">
      This report uses <code>&lt;{name}&gt;</code>, which this app doesn&apos;t provide.
    </div>
  );
}
