import * as Tone from 'tone'

export const useAudio = () => {
    const isReady = useState('audio-ready', () => false)
    let synth: Tone.PolySynth | null = null
    let reverb: Tone.Reverb | null = null

    // F Minor Pentatonic Scale
    const notes = ['F3', 'Ab3', 'Bb3', 'C4', 'Eb4', 'F4', 'Ab4', 'Bb4', 'C5', 'Eb5']

    const initAudio = async () => {
        if (isReady.value) return

        await Tone.start()
        console.log('Audio Context Started')

        // Check Mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        console.log('Audio Mode:', isMobile ? 'Mobile (Performance)' : 'Desktop (High Quality)')

        // Create Effects (Lighter Reverb for Mobile)
        reverb = new Tone.Reverb({
            decay: isMobile ? 1.5 : 4, // Shorter decay on mobile
            preDelay: 0.1,
            wet: isMobile ? 0.2 : 0.3
        }).toDestination()

        // Create Synth
        synth = new Tone.PolySynth(Tone.FMSynth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 1 },
            modulation: { type: 'square' },
            modulationIndex: 3,
        }).connect(reverb)

        // Limit polyphony to avoid performance issues
        synth.maxPolyphony = isMobile ? 4 : 10 // Reduce voices on mobile

        isReady.value = true
    }

    const triggerSound = (x: number, y: number) => {
        if (!synth || !isReady.value) return

        // Check Mobile again for modulation clamping
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

        // Map X to Pitch (Quantized)
        const noteIndex = Math.floor(x * notes.length)
        const note = notes[Math.min(noteIndex, notes.length - 1)]

        // Map Y to Timbre (Modulation Index and Harmonicity)
        // Mobile: Tame the harshness (Modulation Index 1-5)
        // Desktop: Full range (Modulation Index 1-10)
        const maxMod = isMobile ? 5 : 10
        const harmonicity = 0.5 + (y * 3) // 0.5 to 3.5
        const modulationIndex = 1 + (y * maxMod)

        synth.set({
            harmonicity: harmonicity,
            modulationIndex: modulationIndex
        })

        // Random velocity for natural feel
        const velocity = 0.5 + Math.random() * 0.5

        // Trigger Attack Release
        synth.triggerAttackRelease(note, '8n', undefined, velocity)
    }

    return {
        isReady,
        initAudio,
        triggerSound
    }
}
