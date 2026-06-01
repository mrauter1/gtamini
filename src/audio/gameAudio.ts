type AudioContextLike = AudioContext;

export interface EngineAudioState {
  active: boolean;
  speedRatio: number;
  throttle: number;
  paused: boolean;
}

function audioContextCtor(): typeof AudioContext | null {
  return (window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    ?? null;
}

export class GameAudio {
  private context: AudioContextLike | null = null;
  private masterGain: GainNode | null = null;
  private engineTone: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private unlocked = false;
  private lastHeatAlertLevel = 0;

  unlock(): void {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state !== "running") {
      void context.resume();
    }

    this.unlocked = true;
  }

  playUiSelect(): void {
    this.chirp([520, 690], 0.08, "square", 0.035);
  }

  playCollision(intensity = 0.8): void {
    const level = Math.min(1.1, Math.max(0.35, intensity));
    this.chirp([180, 92], 0.12, "sawtooth", 0.05 * level);
  }

  playMissionPickup(): void {
    this.chirp([340, 510, 680], 0.1, "triangle", 0.05);
  }

  playMissionComplete(): void {
    this.chirp([420, 560, 720, 880], 0.12, "triangle", 0.06);
  }

  playHeatAlert(level: number): void {
    if (level <= 0 || level === this.lastHeatAlertLevel) {
      return;
    }

    this.lastHeatAlertLevel = level;
    this.chirp([220, 220, 320], 0.09, "square", 0.055);
  }

  playFail(): void {
    this.chirp([420, 290, 180], 0.14, "sawtooth", 0.06);
  }

  playRespawn(): void {
    this.chirp([220, 330, 480], 0.12, "triangle", 0.05);
  }

  updateEngine(state: EngineAudioState): void {
    const context = this.ensureContext();
    if (!context || !this.engineTone || !this.engineSub || !this.engineGain) {
      return;
    }

    const now = context.currentTime;
    const targetGain =
      this.unlocked && state.active && !state.paused
        ? 0.05 + state.speedRatio * 0.08 + state.throttle * 0.025
        : 0;
    const targetFrequency = 68 + state.speedRatio * 90 + state.throttle * 20;
    const subFrequency = 34 + state.speedRatio * 28;

    this.engineGain.gain.cancelScheduledValues(now);
    this.engineGain.gain.linearRampToValueAtTime(targetGain, now + 0.08);
    this.engineTone.frequency.cancelScheduledValues(now);
    this.engineTone.frequency.linearRampToValueAtTime(targetFrequency, now + 0.08);
    this.engineSub.frequency.cancelScheduledValues(now);
    this.engineSub.frequency.linearRampToValueAtTime(subFrequency, now + 0.08);
  }

  resetHeatAlertMemory(): void {
    this.lastHeatAlertLevel = 0;
  }

  private ensureContext(): AudioContextLike | null {
    if (this.context) {
      return this.context;
    }

    const AudioCtor = audioContextCtor();
    if (!AudioCtor) {
      return null;
    }

    const context = new AudioCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.16;
    masterGain.connect(context.destination);

    const engineTone = context.createOscillator();
    engineTone.type = "sawtooth";
    engineTone.frequency.value = 68;
    const engineSub = context.createOscillator();
    engineSub.type = "triangle";
    engineSub.frequency.value = 34;
    const engineGain = context.createGain();
    engineGain.gain.value = 0;
    const engineLfo = context.createOscillator();
    engineLfo.type = "sine";
    engineLfo.frequency.value = 7.2;
    const engineLfoGain = context.createGain();
    engineLfoGain.gain.value = 2.1;

    engineLfo.connect(engineLfoGain);
    engineLfoGain.connect(engineTone.frequency);
    engineTone.connect(engineGain);
    engineSub.connect(engineGain);
    engineGain.connect(masterGain);

    engineTone.start();
    engineSub.start();
    engineLfo.start();

    this.context = context;
    this.masterGain = masterGain;
    this.engineTone = engineTone;
    this.engineSub = engineSub;
    this.engineGain = engineGain;
    return context;
  }

  private chirp(
    notes: number[],
    segmentDuration: number,
    wave: OscillatorType,
    gainPeak: number,
  ): void {
    const context = this.ensureContext();
    const masterGain = this.masterGain;
    if (!context || !masterGain || !this.unlocked) {
      return;
    }

    const start = context.currentTime + 0.01;
    notes.forEach((note, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = note;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(masterGain);

      const noteStart = start + index * segmentDuration;
      const noteEnd = noteStart + segmentDuration;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.linearRampToValueAtTime(gainPeak, noteStart + segmentDuration * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
  }
}
