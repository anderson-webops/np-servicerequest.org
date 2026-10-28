<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Lend an item',
  description:
    'Post an item lending offer to the community board so neighbors can ask to borrow something you have available.',
})

const { loadBootstrap, securityError, status, submit }
  = useBoardSubmission('itemLending')

onMounted(() => {
  void loadBootstrap()
})
</script>

<template>
  <BoardSubmissionPage
    draft-key="item-lending"
    kind="item-lending"
    note-placeholder="Text first or porch pickup."
    pending-label="Posting lending offer..."
    :security-error="securityError"
    :status="status"
    submit-label="Post lending offer"
    success-text="Lending offer posted. If you posted with email, check it for a private management link to delete the post."
    title="Lend an item"
    @submit="submit"
  >
    <fieldset class="form-section">
      <legend>The item</legend>

      <div class="field-grid">
        <label class="field field--wide">
          <span class="field__label">Item available to lend</span>
          <input
            name="item_available"
            placeholder="Cordless drill, bundt pan, pruning shears, history book set..."
            required
            type="text"
          >
        </label>

        <label class="field field--wide">
          <span class="field__label">Condition or notes</span>
          <input
            name="condition"
            placeholder="New, gently used, heavy, fragile..."
            required
            type="text"
          >
        </label>

        <label class="field">
          <span class="field__label">Neighborhood</span>
          <input
            name="neighborhood"
            required
            type="text"
          >
        </label>

        <label class="field">
          <span class="field__label">Availability</span>
          <input
            name="availability"
            placeholder="Weeknights, weekends, most afternoons..."
            required
            type="text"
          >
        </label>

        <label class="field field--wide">
          <span class="field__label">Borrowing guidelines</span>
          <textarea
            name="guidelines"
            placeholder="How long people can keep it and how to return it."
            required
            rows="5"
          />
        </label>
      </div>
    </fieldset>
  </BoardSubmissionPage>
</template>
