import { useState } from 'react';
import { useGameController, SAVE_KEY } from './useGameController';
import { SetupScreen } from './SetupScreen';
import { GameScreen } from './GameScreen';

export function App() {
  const ctl = useGameController();
  const [showSetup, setShowSetup] = useState(false);
  if (!ctl.game || showSetup) {
    const hasSave = !!ctl.game || !!localStorage.getItem(SAVE_KEY);
    return (
      <SetupScreen
        hasSave={hasSave}
        onResume={() => setShowSetup(false)}
        onImport={(text) => {
          const err = ctl.importJson(text);
          if (!err) setShowSetup(false);
          return err;
        }}
        onStart={(config, seed) => {
          ctl.start(config, seed);
          setShowSetup(false);
        }}
      />
    );
  }
  return <GameScreen key={ctl.game.rng.seed + ':' + ctl.game.config.seats.length} ctl={ctl} />;
}
