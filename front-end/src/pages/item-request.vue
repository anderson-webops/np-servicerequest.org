<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Borrow an item',
  description:
    'Post an item request to the community board for something you want to borrow, such as a tool, book, or kitchen item.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('itemRequest')

onMounted(() => {
  void loadBootstrap()
})
</script>

<template>
  <BoardSubmissionPage
    draft-key="item-request"
    kind="item-request"
    note-placeholder="Text first or weekdays."
    pending-label="Posting item request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post item request"
    success-text="Item request posted. If you posted with email, check it for a private management link to delete the post."
    title="Borrow an item"
    @submit="submit"
  >
    <fieldset class="form-section">
      <legend>The item</legend>

      <div class="field-grid">
        <label class="field field--wide">
          <span class="field__label">Item needed</span>
          <input
            name="item_needed"
            placeholder="Axe, stock pot, cookbook, drill, folding table..."
            required
            type="text"
          >
        </label>

        <label class="field">
          <span class="field__label">How long will you need it?</span>
          <input
            name="duration"
            placeholder="A day, a weekend, two weeks..."
            required
            type="text"
          >
        </label>

        <label class="field">
          <span class="field__label">Need it by <span class="field__optional">(optional)</span></span>
          <input name="needed_by" type="date">
        </label>

        <label class="field">
          <span class="field__label">Your neighborhood</span>
          <input
            name="neighborhood"
            required
            type="text"
          >
        </label>

        <label class="field">
          <span class="field__label">Pickup plan</span>
          <select name="pickup_plan" required>
            <option value="">Select one</option>
            <option>I can pick it up</option>
            <option>I may need drop-off help</option>
            <option>I am flexible</option>
          </select>
        </label>

        <label class="field field--wide">
          <span class="field__label">Details</span>
          <textarea
            name="details"
            required
            rows="5"
          />
        </label>
      </div>
    </fieldset>
  </BoardSubmissionPage>
</template>
