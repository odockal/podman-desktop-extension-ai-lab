<script lang="ts">
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import { router } from 'tinro';
export let object: ModelInfo;

function openDetails() {
  router.goto(`/model/${object.id}`);
}
</script>

<button
  class="flex flex-col w-full"
  title="{object.name}"
  on:click="{() => openDetails()}"
  aria-label="Open Model Details">
  <div class="text-sm text-gray-300 overflow-hidden text-ellipsis w-full text-left" aria-label="Model Name">
    {object.name}
  </div>
  {#if object.registry || object.license}
    <span class="text-xs text-gray-700" aria-label="Model Info">{object.registry} - {object.license}</span>
  {/if}
  {#if !object.registry && !object.license && !object.url}
    <span class="text-xs text-gray-700" aria-label="Imported Model Info">Imported by User</span>
  {/if}
</button>
