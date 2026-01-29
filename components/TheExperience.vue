<template>
  <TresCanvas window-size clear-color="#000" shadows alpha :gl="{ preserveDrawingBuffer: true, alpha: true }">
    <TheScene ref="sceneRef" />
  </TresCanvas>
</template>

<script setup lang="ts">
const sceneRef = ref()
const recordedBlob = ref<Blob | null>(null)

const startRecording = async () => {
  if (sceneRef.value) {
    await sceneRef.value.startRecording()
  }
}

const stopRecording = async () => {
  if (sceneRef.value) {
    const blob = await sceneRef.value.stopRecording()
    recordedBlob.value = blob
    return blob
  }
  return null
}

defineExpose({
  startRecording,
  stopRecording,
  recordedBlob
})
</script>
