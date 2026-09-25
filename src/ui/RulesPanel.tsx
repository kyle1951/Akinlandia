import { useMemo } from 'react';
import { marked } from 'marked';
import rulesMd from '../../docs/rules.md?raw';

export function RulesPanel({ onClose }: { onClose: () => void }) {
  const html = useMemo(() => marked.parse(rulesMd, { async: false }) as string, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 820 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>The Rules of Akinlandia</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="rules" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
