import * as Tone from 'tone'
import * as Mp4Muxer from 'mp4-muxer'

export const useRecorder = () => {
    const isRecording = ref(false)
    const recordedBlob = ref<Blob | null>(null)

    let mediaRecorder: MediaRecorder | null = null
    let chunks: Blob[] = []
    let streamDestination: MediaStreamAudioDestinationNode | null = null
    let audioContext: AudioContext | null = null

    // Helper: Check Browser Support
    const getSupportedMimeType = () => {
        const types = [
            'video/webm;codecs=h264',
            'video/webm;codecs=vp9',
            'video/webm',
            'video/mp4'
        ]
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type
        }
        return ''
    }

    const startRecording = async (canvas: HTMLCanvasElement) => {
        if (isRecording.value) return

        console.log('UseRecorder: Initializing...')

        try {
            // 0. Vital Checks
            if (!canvas) throw new Error('Canvas not found')

            // 1. Audio Setup (Must happen before stream creation)
            if (Tone.context.state !== 'running') {
                console.log('UseRecorder: Resuming Audio Context...')
                await Tone.start()
            }

            // Create a Destination Node to intercept audio
            // Tone.context.rawContext is the native AudioContext
            const rawContext = Tone.context.rawContext as AudioContext
            audioContext = rawContext
            streamDestination = rawContext.createMediaStreamDestination()

            // Connect Tone's Master Output to this destination
            // This allows us to hear the sound AND record it
            Tone.getDestination().connect(streamDestination)

            // 2. Video Stream from Canvas
            // captureStream(60) might be too aggressive for some devices, trying 30 if 60 fails? 
            // Standard is just captureStream() or captureStream(FPS)
            const canvasStream = canvas.captureStream(60)

            // 3. Combine Streams
            const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...streamDestination.stream.getAudioTracks()
            ])

            // 4. Initialize Recorder
            const mimeType = getSupportedMimeType()
            console.log('UseRecorder: Using MimeType', mimeType)

            if (!mimeType) throw new Error('No supported MimeType found')

            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType,
                videoBitsPerSecond: 5_000_000, // 5 Mbps quality
            })

            chunks = []
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunks.push(e.data)
                }
            }

            mediaRecorder.onerror = (e) => {
                console.error('UseRecorder: MediaRecorder Error', e)
            }

            // Start Recording
            mediaRecorder.start(100) // 100ms chunks
            isRecording.value = true
            console.log('UseRecorder: Started')

        } catch (e) {
            console.error('UseRecorder: Start Failed', e)
            isRecording.value = false
            // Clean up if failed
            if (streamDestination) {
                Tone.getDestination().disconnect(streamDestination)
                streamDestination = null
            }
        }
    }

    const stopRecording = async () => {
        if (!isRecording.value || !mediaRecorder) return null

        console.log('UseRecorder: Stopping...')

        return new Promise<Blob | null>((resolve) => {
            mediaRecorder!.onstop = () => {
                const blob = new Blob(chunks, { type: mediaRecorder!.mimeType })
                console.log(`UseRecorder: Wrapped Up. Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`)

                recordedBlob.value = blob

                // Cleanup Audio Connection so we don't leak memory or duplicate sound
                if (streamDestination) {
                    Tone.getDestination().disconnect(streamDestination)
                    streamDestination = null
                }

                isRecording.value = false
                mediaRecorder = null
                chunks = []

                resolve(blob)
            }

            // Force stop
            if (mediaRecorder!.state !== 'inactive') {
                mediaRecorder!.stop()
            }
        })
    }

    // Compose with Logo (Using VideoEncoder/Mp4Muxer for client-side editing)
    // NOTE: If this fails, we should modify App.vue to download the raw 'recordedBlob' instead of crashing.
    const composeVideo = async (sourceBlob: Blob, frameSrc: string): Promise<Blob> => {
        console.log('UseRecorder: Composing with frame...', frameSrc)

        if (!frameSrc) return sourceBlob

        const video = document.createElement('video')
        video.src = URL.createObjectURL(sourceBlob)
        video.crossOrigin = 'anonymous'
        video.muted = true // We will handle audio via tracks
        await video.play() // Must play to get tracks and dimensions
        video.pause()

        const width = video.videoWidth
        const height = video.videoHeight

        // Setup Output Muxer
        const muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width, height },
            audio: {
                codec: 'aac',
                numberOfChannels: 2,
                sampleRate: 44100
            },
            fastStart: 'in-memory'
        })

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => console.error(e)
        })
        videoEncoder.configure({
            codec: 'avc1.42001f',
            width, height,
            bitrate: 4_000_000,
            framerate: 60
        })

        const audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: e => console.error(e)
        })
        audioEncoder.configure({
            codec: 'mp4a.40.2',
            numberOfChannels: 2,
            sampleRate: 44100,
            bitrate: 128_000
        })

        // Prepare Canvas for Composition
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!

        const frameImg = new Image()
        frameImg.src = frameSrc
        await new Promise(r => frameImg.onload = r)

        // Frame processing loop
        // We will "play" the video into the canvas + frame

        // ... (Simpler approach: Just re-record logic ?)
        // VideoEncoder approach is complex. 
        // Let's stick to the previous working VideoEncoder implementation for composition
        // BUT make it safer.

        return new Promise(async (resolve, reject) => {
            try {
                // Audio Extraction from Source Video
                // We must use a new AudioContext to decode/capture audio from the video element
                const ac = new AudioContext()
                const sourceNode = ac.createMediaElementSource(video)
                const destNode = ac.createMediaStreamDestination()
                sourceNode.connect(destNode)
                // Don't connect to speaker (ac.destination) to avoid echo

                const audioTrack = destNode.stream.getAudioTracks()[0]
                const trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack })
                const reader = trackProcessor.readable.getReader()

                // Audio Loop
                let processing = true
                const processAudio = async () => {
                    while (processing) {
                        const { done, value } = await reader.read()
                        if (done) break
                        if (value) {
                            audioEncoder.encode(value)
                            value.close()
                        }
                    }
                }
                processAudio()

                // Video Loop
                video.currentTime = 0
                await video.play()

                const processFrame = async (now: number, metadata: VideoFrameCallbackMetadata) => {
                    if (video.ended) {
                        processing = false
                        await reader.cancel()

                        await videoEncoder.flush()
                        await audioEncoder.flush()
                        videoEncoder.close()
                        audioEncoder.close()
                        muxer.finalize()
                        ac.close()

                        const { buffer } = muxer.target as Mp4Muxer.ArrayBufferTarget
                        resolve(new Blob([buffer], { type: 'video/mp4' }))
                        return
                    }

                    ctx.drawImage(video, 0, 0, width, height)
                    // Draw Logo (Top Right)
                    const logoW = width * 0.15
                    const logoH = (logoW / frameImg.width) * frameImg.height
                    ctx.drawImage(frameImg, width - logoW - 20, 20, logoW, logoH)

                    const frame = new VideoFrame(canvas, { timestamp: metadata.mediaTime * 1e6 })
                    videoEncoder.encode(frame)
                    frame.close()

                    video.requestVideoFrameCallback(processFrame)
                }
                video.requestVideoFrameCallback(processFrame)

            } catch (err) {
                reject(err)
            }
        })
    }

    return {
        isRecording,
        recordedBlob,
        startRecording,
        stopRecording,
        composeVideo
    }
}
