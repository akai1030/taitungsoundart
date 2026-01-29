import { readMultipartFormData } from 'h3'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'

// Configure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export default defineEventHandler(async (event) => {
    // 1. Parse Multipart Data
    const body = await readMultipartFormData(event)
    if (!body) {
        throw createError({ statusCode: 400, statusMessage: 'No multipart data parsed' })
    }

    // Extract Files/Fields
    const videoPart = body.find(p => p.name === 'video')
    const framePathPart = body.find(p => p.name === 'frame')

    if (!videoPart || !videoPart.data) {
        throw createError({ statusCode: 400, statusMessage: 'Missing video file' })
    }

    // 2. Setup Temporary Paths
    const tmpDir = os.tmpdir()
    const id = uuidv4()
    const inputPath = path.join(tmpDir, `input-${id}.webm`) // Assuming webm/mp4 input
    const outputPath = path.join(tmpDir, `output-${id}.mp4`)

    // Write Input File
    fs.writeFileSync(inputPath, videoPart.data)

    // Determine Frame Path (Server-side)
    // framePathPart value comes as Buffer, convert to string
    let frameFile = ''
    if (framePathPart && framePathPart.data) {
        // Client sends relative path like '/frames/frame_01.png'
        const relativePath = framePathPart.data.toString()
        // Resolve to absolute disk path (Nuxt public dir)
        // In dev: <root>/public/frames/x.png
        // In prod: tricky, but usually we can find it relative to cwd or bundle
        // Let's assume process.cwd() is project root in standard Nuxt deployments
        if (relativePath && relativePath !== 'null' && relativePath !== '') {
            const cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath
            frameFile = path.resolve(process.cwd(), 'public', cleanPath)

            if (!fs.existsSync(frameFile)) {
                console.warn('Frame file not found:', frameFile)
                frameFile = '' // Fallback to no frame
            }
        }
    }

    console.log(`[FFmpeg] Processing: ${inputPath} + ${frameFile} -> ${outputPath}`)

    // 3. Run FFmpeg
    return new Promise((resolve, reject) => {
        let command = ffmpeg(inputPath)

        // Complex Filter Construction
        // Scale video to 1080:-2 (1080p width, auto height even)
        // If frame exists, overlay it.

        const videoFilters = []
        // 1. Scale to standard 1080p width (if larger, or just enforce it)
        // 'force_original_aspect_ratio=decrease' ensures we fit in 1080 w/o upscale if desired, 
        // but usually user wants fixed width.
        // 'pad=ceil(iw/2)*2:ceil(ih/2)*2' guarantees even dimensions
        videoFilters.push('scale=1080:-2')

        if (frameFile) {
            command.input(frameFile)
            // Scale overlay to 15% of width, positioned top-right
            // We use complex filter logic:
            // [0:v] processed input
            // [1:v] frame image
            // Overlay command: overlay=W-w-20:20 (20px padding from top-right)

            // We need to scale the frame input [1:v] first to match relative size
            // This gets complex in fluent-ffmpeg API, easier to write string filter chain
            // [1:v]scale=iw*0.15:-1[logo];[0:v][logo]overlay=main_w-overlay_w-20:20
            // NOTE: The issue is referencing the dynamic scale of video [0:v].
            // Simpler approach: Draw logo with fixed scale if we know target is 1080. 
            // 1080 * 0.15 = 162px width.

            command.complexFilter([
                '[0:v]scale=1080:-2[bg]', // Scale background
                `[1:v]scale=162:-1[fg]`,   // Scale foreground
                '[bg][fg]overlay=main_w-overlay_w-20:20' // Overlay
            ])
        } else {
            command.videoFilters('scale=1080:-2')
        }

        command
            .outputOptions([
                '-c:v libx264',      // H.264
                '-preset veryfast',  // Fast encoding for UX
                '-profile:v main',   // Main Profile (IG Safe)
                '-level:v 4.1',      // Level 4.1 (Standard compatibility)
                '-pix_fmt yuv420p',  // Critical for QuickTime/iOS
                '-movflags +faststart', // Optimize for web playback
                '-c:a aac',          // Audio Codec
                '-b:a 128k'          // Audio Bitrate
            ])
            .output(outputPath)
            .on('end', () => {
                console.log('[FFmpeg] Success')
                // Read file and send
                const fileBuffer = fs.readFileSync(outputPath)

                // Cleanup
                try {
                    fs.unlinkSync(inputPath)
                    fs.unlinkSync(outputPath)
                } catch (e) { console.error('Cleanup failed', e) }

                resolve(fileBuffer)
            })
            .on('error', (err, stdout, stderr) => {
                console.error('[FFmpeg] Error:', err.message)
                console.error('ffmpeg stderr:', stderr)

                // Cleanup input
                try { fs.unlinkSync(inputPath) } catch (e) { }

                reject(createError({ statusCode: 500, statusMessage: 'Video processing failed' }))
            })
            .run()
    })
})
