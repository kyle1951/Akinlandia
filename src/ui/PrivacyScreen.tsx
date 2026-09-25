export function PrivacyScreen({ name, what, onContinue }: { name: string; what: string; onContinue: () => void }) {
  return (
    <div className="privacy">
      <p style={{ fontSize: 14, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.6 }}>A private matter of state</p>
      <h1>Pass the device to {name}</h1>
      <p>{what}</p>
      <p style={{ fontSize: 14, opacity: 0.6 }}>Everyone else: avert your eyes. "Any sort of apparent mutual understanding or subversion of the spirit of the rules" is frowned upon.</p>
      <button className="primary" style={{ fontSize: 18, padding: '10px 26px' }} onClick={onContinue}>
        I am {name}. Show me.
      </button>
    </div>
  );
}
