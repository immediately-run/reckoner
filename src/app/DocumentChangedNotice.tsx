// The §4.4 staleness affordance (DOCUMENT_NAVIGATOR_SPEC, DN-R11): the session reads
// the document once, so after an edit lands through the platform editor the rendered
// report shows OLD numbers with no indication they are stale — a defect the edit
// feature would introduce, not inherit. This notice is the explicit answer: it names
// the staleness, and its one action re-reads the document through the same mount
// resolution (the report hook's `reload`).

interface DocumentChangedNoticeProps {
  onReload: () => void;
}

function DocumentChangedNotice({ onReload }: DocumentChangedNoticeProps) {
  return (
    <div className="rk-stale" role="status">
      <span>
        The mounted document changed after this report was rendered — the figures below are stale.
      </span>
      <button type="button" className="rk-chip rk-chip--nav" onClick={onReload}>
        Reload document
      </button>
    </div>
  );
}

export default DocumentChangedNotice;
