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
          
          <!-- Animated Background Mesh (CSS) -->
          <div class="bg-mesh"></div>

          <div class="header">
            <h2 class="collab-title">臺東聲音藝術節 <span class="x">✕</span> 轉駅創研試驗所</h2>
            <div class="decoration-line"></div>
          </div>

          <div class="preview-container">
            <video ref="previewVideo" autoplay loop playsinline controls></video>
            <img v-if="selectedFrame" :src="selectedFrame" class="frame-overlay" />
          </div>

          <div class="frame-selector">
             <div class="label">SELECT FRAME</div>
             <div class="options">
                <button @click="selectedFrame = null" :class="{ active: !selectedFrame }">None</button>
                <button @click="selectedFrame = '/frames/frame_01.png'" :class="{ active: selectedFrame?.includes('01') }">Style A</button>
                <button @click="selectedFrame = '/frames/frame_02.png'" :class="{ active: selectedFrame?.includes('02') }">Style B</button>
             </div>
          </div>

          <div class="actions">
             <button class="btn secondary" @click="reset">
                <span class="icon">↺</span> 重錄
             </button>
             
             <!-- Share Button -->
             <button v-if="canShare" class="btn primary highlight" @click="shareVideo" :disabled="isProcessing">
               {{ isProcessing ? '處理中...' : '分享 IG 限動' }}
             </button>

             <button class="btn primary" @click="downloadVideo" :disabled="isProcessing">
               {{ isProcessing ? '處理中...' : '下載影片' }}
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
  // Use explicit typeof check to satisfy linter and ensure runtime safety
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    canShare.value = true
  }
})

const enterExperience = async () => {
  state.value = 'PLAY'
}

const toggleRecording = async () => {
  if (state.value === 'PLAY') {
    state.value = 'RECORDING'
    timeLeft.value = 10
    await experienceRef.value?.startRecording()
    
    timerInterval = setInterval(async () => {
      timeLeft.value--
      if (timeLeft.value <= 0) {
        await stopRecording()
      }
    }, 1000)
    
  } else {
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

// Helper: Get Final Processed Blob (Server-Side)
const getFinalBlob = async () => {
  if (!recordedBlob.value) return null
  
  isProcessing.value = true
  try {
     const formData = new FormData()
     formData.append('video', recordedBlob.value, 'recording.webm')
     if (selectedFrame.value) {
         formData.append('frame', selectedFrame.value)
     }

     console.log('Uploading to server for processing...')
     
     const response = await fetch('/api/process-video', {
         method: 'POST',
         body: formData
     })

     if (!response.ok) {
         throw new Error('Server processing failed')
     }

     const blob = await response.blob()
     return blob

  } catch (e) {
     console.error('Processing failed', e)
     const confirmRaw = confirm('雲端轉檔失敗 (可能是網路問題)。是否下載原始錄影檔？')
     if (confirmRaw) {
         return recordedBlob.value 
     } else {
         return null
     }
  } finally {
     isProcessing.value = false
  }
}

const shareVideo = async () => {
  const blob = await getFinalBlob()
  if (!blob) return
  
  try {
    await navigator.clipboard.writeText(window.location.href)
  } catch (err) {
    console.log('Clipboard write failed', err)
  }
  
  const file = new File([blob], 'sound-art-story.mp4', { type: 'video/mp4' })
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Sound Art',
        text: 'Check out my sound creation! (Link copied to clipboard)'
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
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;500;700&display=swap');

.app-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background: #000;
  font-family: 'Inter', 'Noto Sans TC', sans-serif;
  color: white;
  overflow: hidden;
}

.ui-layer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

// Controls
.intro-screen, .controls, .review-screen {
  pointer-events: auto;
}

.intro-screen {
  text-align: center;
  cursor: pointer;
  
  h1 {
    font-size: 3rem;
    font-weight: 100;
    letter-spacing: 5px;
    background: linear-gradient(to right, #fff, #888);
    -webkit-background-clip: text;
    color: transparent;
  }
  
  .subtitle {
    font-size: 0.9rem;
    color: #666;
    margin-top: 10px;
    animation: flash 2s infinite;
  }
}

.controls {
  position: absolute;
  bottom: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  
  .instruction {
    font-size: 0.8rem;
    color: rgba(255,255,255,0.6);
    letter-spacing: 1px;
  }
}

.rec-btn {
  width: 80px; height: 80px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(5px);
  padding: 5px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  
  .inner {
    width: 100%; height: 100%;
    background: #ff4444;
    border-radius: 50%;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 20px rgba(255, 68, 68, 0.3);
  }
  
  &.recording {
    border-color: #ff4444;
    transform: scale(1.1);
    
    .inner {
      border-radius: 12px;
      transform: scale(0.5);
      background: #ff4444;
      box-shadow: 0 0 30px rgba(255, 68, 68, 0.6);
    }
  }
}

// Review Screen (The "Download" Screen)
.review-screen {
  position: absolute;
  inset: 0;
  // Glassmorphism 
  background: rgba(10, 10, 15, 0.6); 
  backdrop-filter: blur(20px) saturate(180%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 25px;
  
  .bg-mesh {
    position: absolute;
    inset: 0;
    opacity: 0.2;
    background: 
      radial-gradient(circle at 20% 30%, rgba(100,0,255,0.4), transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(255,0,100,0.4), transparent 50%);
    animation: flow 10s infinite alternate;
    z-index: -1;
  }

  .header {
    text-align: center;
    margin-bottom: 10px;
    z-index: 2;
    
    .collab-title {
        font-size: 1rem;
        font-weight: 500;
        letter-spacing: 2px;
        color: #ddd;
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: center;
        
        .x { font-size: 0.7rem; color: #888; }
    }
    
    .decoration-line {
        width: 40px;
        height: 2px;
        background: radial-gradient(circle, white, transparent);
        margin: 10px auto 0;
        opacity: 0.5;
    }
  }

  .preview-container {
    position: relative;
    width: 280px; 
    max-width: 80vw;
    aspect-ratio: 9/16; // Force standard ratio
    height: auto;
    max-height: 55vh;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 
        0 20px 50px rgba(0,0,0,0.5),
        0 0 0 1px rgba(255,255,255,0.1); // Inner border
    
    video {
      width: 100%; height: 100%;
      object-fit: cover;
      background: #111;
    }
  }

  .frame-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    
    .label {
        font-size: 0.6rem;
        color: #666;
        letter-spacing: 2px;
        font-weight: bold;
    }
    
    .options {
        display: flex;
        gap: 10px;
        background: rgba(255,255,255,0.1);
        padding: 5px;
        border-radius: 30px;
        
        button {
          background: transparent;
          border: none;
          color: #888;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.8rem;
          transition: 0.3s;
          
          &.active {
            background: white;
            color: black;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
          }
        }
    }
  }

  .actions {
    display: flex;
    gap: 15px;
    width: 100%;
    justify-content: center;
    padding: 0 20px;
    
    .btn {
      padding: 14px 24px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1);
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9rem;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: transform 0.2s, box-shadow 0.2s;
      
      &:active { transform: scale(0.96); }
      
      &.primary { 
        background: white; 
        color: black; 
        box-shadow: 0 0 20px rgba(255,255,255,0.1);
        
        &.highlight {
            background: linear-gradient(135deg, #fff, #ddd);
        }
      }
      
      &.secondary { 
        background: rgba(0,0,0,0.4); 
        color: #aaa; 
        backdrop-filter: blur(10px);
        
        &:hover { color: white; background: rgba(0,0,0,0.6); }
      }
      
      &:disabled { opacity: 0.5; cursor: wait; }
    }
  }
}

@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
@keyframes flash { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
@keyframes flow { 0% { transform: scale(1); opacity: 0.2; } 100% { transform: scale(1.2); opacity: 0.4; } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.6s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.up-enter-active, .up-leave-active { transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
.up-enter-from, .up-leave-to { opacity: 0; transform: translateY(50px); }

</style>
