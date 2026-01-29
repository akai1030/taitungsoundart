<template>
  <div class="app-container" :class="state">
    <ClientOnly>
      <TheExperience ref="experienceRef" />
    </ClientOnly>
    
    <!-- UI Layer -->
    <div class="ui-layer">
      
      <!-- INTRO STATE -->
      <transition name="fade">
        <div v-if="state === 'INTRO'" class="intro-screen" @click="enterExperience">
          <h1>SOUND ART</h1>
          <p class="subtitle">Touch to Enter the Void</p>
        </div>
      </transition>

      <!-- PLAY / RECORDING STATE -->
      <transition name="fade">
        <div v-if="state === 'PLAY' || state === 'RECORDING'" class="controls">
          <button 
            class="rec-btn" 
            :class="{ recording: state === 'RECORDING' }"
            @click="toggleRecording"
          >
            <div class="inner">
               <span v-if="state === 'RECORDING'" class="timer">{{ timeLeft }}</span>
            </div>
          </button>
          <p class="instruction">{{ state === 'RECORDING' ? 'Recording...' : 'Tap Red Button to Record (10s)' }}</p>
        </div>
      </transition>

      <!-- REVIEW STATE -->
      <transition name="up">
        <div v-if="state === 'REVIEW'" class="review-screen">
          <div class="preview-container">
            <video ref="previewVideo" autoplay loop playsinline controls></video>
            
            <!-- Frame Overlay (Visual Only) -->
            <img 
              v-if="selectedFrame" 
              :src="selectedFrame" 
              class="frame-overlay" 
            />
          </div>

          <div class="frame-selector">
            <button @click="selectedFrame = null" :class="{ active: !selectedFrame }">None</button>
            <button @click="selectedFrame = '/frames/frame_01.png'" :class="{ active: selectedFrame?.includes('01') }">Frame 1</button>
            <button @click="selectedFrame = '/frames/frame_02.png'" :class="{ active: selectedFrame?.includes('02') }">Frame 2</button>
          </div>

          <div class="actions">
             <button class="btn secondary" @click="reset">Discard</button>
             
             <!-- Share Button (Mobile Only usually) -->
             <button v-if="canShare" class="btn primary highlight" @click="shareVideo" :disabled="isProcessing">
               {{ isProcessing ? 'Processing...' : 'Share to IG' }}
             </button>

             <button class="btn primary" @click="downloadVideo" :disabled="isProcessing">
               {{ isProcessing ? 'Processing...' : 'Download' }}
             </button>
          </div>
        </div>
      </transition>

    </div>
  </div>
</template>

<script setup lang="ts">
// State Machine: INTRO -> PLAY -> RECORDING -> REVIEW
const state = ref<'INTRO' | 'PLAY' | 'RECORDING' | 'REVIEW'>('INTRO')
const experienceRef = ref()
const previewVideo = ref<HTMLVideoElement>()
const recordedBlob = ref<Blob | null>(null)
const selectedFrame = ref<string | null>(null)
const timeLeft = ref(10)
let timerInterval: any = null
const canShare = ref(false)

onMounted(() => {
  // Check Share Support
  if (navigator.share && navigator.canShare) {
    canShare.value = true
  }
})

const enterExperience = async () => {
  // Audio context is likely started by the first touch inside TheExperience logic
  state.value = 'PLAY'
}

const toggleRecording = async () => {
  if (state.value === 'PLAY') {
    // Start Recording
    state.value = 'RECORDING'
    timeLeft.value = 10
    await experienceRef.value?.startRecording()
    
    // Start Timer
    timerInterval = setInterval(async () => {
      timeLeft.value--
      if (timeLeft.value <= 0) {
        await stopRecording()
      }
    }, 1000)
    
  } else {
    // Stop Manually
    await stopRecording()
  }
}

const stopRecording = async () => {
  if (timerInterval) clearInterval(timerInterval)
  state.value = 'REVIEW'
  const blob = await experienceRef.value?.stopRecording()
  recordedBlob.value = blob
  if (previewVideo.value && blob) {
    previewVideo.value.src = URL.createObjectURL(blob)
  }
}

const reset = () => {
  state.value = 'PLAY'
  recordedBlob.value = null
  selectedFrame.value = null
  if (timerInterval) clearInterval(timerInterval)
}

const isProcessing = ref(false)
const { composeVideo } = useRecorder()

// Helper: Get Final Processed Blob
const getFinalBlob = async () => {
  if (!recordedBlob.value) return null
  
  isProcessing.value = true
  try {
     await new Promise(r => setTimeout(r, 100)) // UI Update
     // @ts-ignore
     const blob = await composeVideo(recordedBlob.value, selectedFrame.value || '')
     return blob
  } catch (e) {
     console.error('Processing failed', e)
     alert('Processing failed. Using raw video.')
     return recordedBlob.value // Fallback
  } finally {
     isProcessing.value = false
  }
}

const shareVideo = async () => {
  const blob = await getFinalBlob()
  if (!blob) return
  
  const file = new File([blob], 'sound-art-story.mp4', { type: 'video/mp4' })
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Sound Art',
        text: 'Review my sound creation!'
      })
    } catch (e) {
      console.log('Share canceled or failed', e)
    }
  } else {
    alert('Sharing not supported on this device/browser.')
  }
}

const downloadVideo = async () => {
  const blob = await getFinalBlob() 
  if (!blob) return
  
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = `sound-art-${Date.now()}.mp4`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
}
</script>

<style lang="scss">
.app-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background: #000;
  font-family: 'Inter', sans-serif;
  color: white;
}

.ui-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

// Controls
.intro-screen, .controls, .review-screen {
  pointer-events: auto;
}

.intro-screen {
  text-align: center;
  cursor: pointer;
}

.controls {
  position: absolute;
  bottom: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.rec-btn {
  width: 70px; height: 70px;
  border-radius: 50%;
  border: 2px solid white;
  background: transparent;
  padding: 5px;
  cursor: pointer;
  transition: all 0.3s;
  
  .inner {
    width: 100%; height: 100%;
    background: #ff0000;
    border-radius: 50%;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .timer {
    color: white;
    font-weight: 900;
    font-size: 1.8rem;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    text-shadow: 0 0 5px red;
  }
  
  &.recording {
    border-color: #ff0000;
    // animation: pulse 2s infinite; // Disabling pulse to show timer clearly
    .inner {
      border-radius: 4px;
      transform: scale(0.9);
      background: rgba(255, 0, 0, 0.8);
    }
  }
}

// Review Screen
.review-screen {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  backdrop-filter: blur(10px);
}

.preview-container {
  position: relative;
  width: 300px;
  max-width: 90vw; // RWD Safety
  height: 300px;
  max-height: 50vh; // RWD Safety for landscape 
  
  video {
    width: 100%; height: 100%;
    object-fit: cover;
    background: #222;
  }
  
  .frame-overlay {
    position: absolute;
    top: 20px; right: 20px;
    width: 15%; 
    height: auto;
    pointer-events: none;
    z-index: 2;
    filter: drop-shadow(0 0 5px rgba(0,0,0,0.5));
  }
}

.frame-selector {
  display: flex;
  gap: 10px;
  
  button {
    background: transparent;
    border: 1px solid #444;
    color: #888;
    padding: 5px 10px;
    cursor: pointer;
    
    &.active {
      border-color: white;
      color: white;
    }
  }
}

.actions {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
  
  .btn {
    padding: 10px 20px;
    border-radius: 20px;
    border: none;
    cursor: pointer;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.8rem;
    
    &.primary { background: white; color: black; }
    &.secondary { background: #333; color: white; }
    
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
