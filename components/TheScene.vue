<template>
  <TresPerspectiveCamera :position="[0, 0, 10]" :look-at="[0, 0, 0]" />
  
  <!-- Ambiance -->
  <TresAmbientLight :intensity="0.5" />
  
  <!-- Interaction Plane -->
  <TresMesh 
    name="interaction-plane"
    :visible="false"
    @click="handlePointerDown"
    @pointer-move="handlePointerMove"
    @pointer-up="handlePointerUp"
    @pointer-leave="handlePointerUp"
    @pointer-missed="handlePointerUp"
  >
    <TresPlaneGeometry :args="[20, 20]" />
    <TresMeshBasicMaterial :transparent="true" :opacity="0" />
  </TresMesh>

  <!-- Visual Hint (Cursor Follower) -->
  <TresMesh ref="cursorRef" :position="[0,0,0.1]">
    <TresRingGeometry :args="[0.05, 0.06, 32]" />
    <TresMeshBasicMaterial color="#fff" :transparent="true" :opacity="0.3" :blending="AdditiveBlending" />
  </TresMesh>

  <!-- Ripples -->
  <TresGroup>
    <TresMesh 
      v-for="ripple in ripples" 
      :key="ripple.id" 
      :position="[ripple.x, ripple.y, 0]"
      :scale="[ripple.scale, ripple.scale, 1]"
    >
      <TresRingGeometry :args="[0.1, 0.15, 32]" />
      <TresMeshBasicMaterial 
        :color="ripple.color" 
        :transparent="true" 
        :opacity="ripple.opacity" 
        :blending="AdditiveBlending"
      />
    </TresMesh>
  </TresGroup>
</template>

<script setup lang="ts">
import { unref } from 'vue'
import { Color, AdditiveBlending } from 'three'
import { v4 as uuidv4 } from 'uuid'
import gsap from 'gsap'

// Import from auto-imported composables (Nuxt)
const { initAudio, triggerSound } = useAudio()

// --- State ---
const cursorRef = ref()
const ripples = ref<{id: string, x: number, y: number, scale: number, opacity: number, color: string}[]>([])

// --- Interaction Handlers ---
// --- Interaction Handlers ---
const isDragging = ref(false)
const lastTriggerTime = ref(0)
const TRIGGER_THROTTLE = 100 // ms between triggers during drag

const handlePointerMove = (ev: any) => {
  if (cursorRef.value) {
    cursorRef.value.position.x = ev.point.x
    cursorRef.value.position.y = ev.point.y
  }

  // Drag Logic
  if (isDragging.value) {
    const now = Date.now()
    if (now - lastTriggerTime.value > TRIGGER_THROTTLE) {
      triggerInteraction(ev.point.x, ev.point.y)
      lastTriggerTime.value = now
    }
  }
}

const handlePointerDown = async (ev: any) => {
  isDragging.value = true
  await initAudio()
  triggerInteraction(ev.point.x, ev.point.y)
}

const handlePointerUp = () => {
  isDragging.value = false
}

const triggerInteraction = (x: number, y: number) => {
  // Trigger Sound (Normalized X/Y based on assumed plane size 20x20)
  const normX = (x + 10) / 20
  const normY = (y + 10) / 20
  triggerSound(normX, normY)
  createRipple(x, y)
}

// --- Visual Logic ---
const createRipple = (x: number, y: number) => {
  const id = uuidv4()
  
  const ripple = {
    id,
    x,
    y,
    scale: 1,
    opacity: 1,
    color: '#ffffff'
  }

  ripples.value.push(ripple)

  // Animate Ripple
  const obj = { scale: 1, opacity: 1 }
  gsap.to(obj, {
    scale: 5,
    opacity: 0,
    duration: 1.5,
    ease: 'power2.out',
    onUpdate: () => {
      const idx = ripples.value.findIndex(r => r.id === id)
      if (idx !== -1) {
        ripples.value[idx].scale = obj.scale
        ripples.value[idx].opacity = obj.opacity
      }
    },
    onComplete: () => {
      const idx = ripples.value.findIndex(r => r.id === id)
      if (idx !== -1) {
        ripples.value.splice(idx, 1)
      }
    }
  })
}

// --- Recording Logic ---
import { useTresContext } from '@tresjs/core'
const context = useTresContext()
const { startRecording: startRec, stopRecording: stopRec, recordedBlob } = useRecorder()

const startRecording = async () => {
  // Safe Access to Canvas
  let canvas: HTMLCanvasElement | null = null
  
  // 1. Try Tres Context
  const renderer = unref(context.renderer)
  if (renderer && (renderer as any).domElement) {
     canvas = (renderer as any).domElement
  }

  // 2. Fallback: Query Selector (Robust for Single Canvas App)
  if (!canvas) {
    canvas = document.querySelector('canvas')
  }

  if (canvas) {
    console.log('Canvas found:', canvas)
    await startRec(canvas)
  } else {
    console.error('Canvas not found')
  }
}

const stopRecording = async () => {
  return await stopRec()
}

defineExpose({
  startRecording,
  stopRecording,
  recordedBlob
})
</script>
