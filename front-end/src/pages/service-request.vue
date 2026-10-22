<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Request a service project',
  description:
    'Post a service project to the community board and describe the job, timing, and location so someone can respond.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('service')

onMounted(() => {
  void loadBootstrap()
})
</script>

<template>
  <BoardSubmissionPage
    draft-key="service-request"
    kind="service-request"
    note-placeholder="Text first or evenings."
    pending-label="Posting service request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post service request"
    success-text="Service request posted. If you posted with email, check it for a private management link to delete the post."
    title="Request a service project"
    @submit="submit"
  >
    <fieldset class="form-section">
      <legend>The project</legend>

      <div class="field-grid">
        <label class="field">
          <span class="field__label">Project type</span>
          <select name="project_type" required>
            <option value="">Select one</option>
            <option>Cleanup</option>
            <option>Repair</option>
            <option>Accessibility</option>
            <option>Moving help</option>
            <option>Setup or teardown</option>
            <option>Other</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Timing</span>
          <input
            name="timing"
            placeholder="Saturday morning or next week"
            required
            type="text"
          >
        </label>

        <label class="field field--wide">
          <span class="field__label">Location or neighborhood</span>
          <input
            autocomplete="street-address"
            name="location"
            required
            type="text"
          >
        </label>

        <label class="field field--wide">
          <span class="field__label">Project details</span>
          <textarea
            name="details"
            placeholder="What needs doing, how many people, and anything to bring."
            required
            rows="6"
          />
        </label>
      </div>
    </fieldset>
  </BoardSubmissionPage>
</template>
