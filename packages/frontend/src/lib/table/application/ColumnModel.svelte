<script lang="ts">
import type { ApplicationState } from '@shared/src/models/IApplicationState';
import { catalog } from '/@/stores/catalog';
import { displayPorts } from '/@/utils/printers';

export let object: ApplicationState;

$: name = $catalog.models.find(r => r.id === object.modelId)?.name;
</script>

<div class="flex flex-col">
  <div class="text-sm text-gray-300 overflow-hidden text-ellipsis">
    {name}
  </div>
  <div class="text-sm text-gray-700 overflow-hidden text-ellipsis">
    {displayPorts(object.modelPorts)}
  </div>
</div>
