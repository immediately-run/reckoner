// The component-owned degraded state (§3.3 point 4, RQ-C2): a bound cell threw, was never
// published, or resolved to the wrong shape. View mode shows a marked broken tile with no
// internals; the reason is a muted caption (useful in edit mode, harmless in view). Never a
// blank, never a crash, never silent wrong data. An unconsented-feed variant reads as a
// "needs access" affordance rather than an error.
export default function BrokenTile({
  component,
  reason,
  variant = 'error',
}: {
  component: string;
  reason: string;
  variant?: 'error' | 'needs-access';
}) {
  const title = variant === 'needs-access' ? 'Needs data access' : 'Unavailable';
  return (
    <div className="rk-broken" data-variant={variant} role="note" aria-label={`${component}: ${title}`}>
      <span className="rk-broken-title">{title}</span>
      <span className="rk-broken-reason">{reason}</span>
    </div>
  );
}
