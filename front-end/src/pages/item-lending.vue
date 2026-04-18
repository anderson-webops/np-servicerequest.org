<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Volunteer an item to lend',
  description: 'Post an item lending offer to the community board so neighbors can ask to borrow something you have available.',
})

const { loadBootstrap, securityError, status, submit } = useBoardSubmission('itemLending')

onMounted(() => {
  void loadBootstrap()
})
</script>

<template>
  <BoardSubmissionPage
    description="List items you are willing to share, from tools and kitchen utensils to books and specialty equipment, so people know what is available."
    eyebrow="Volunteer an item to lend"
    :examples="[
      'Say what the item is and what condition it is in.',
      'Explain any borrowing rules, pickup limits, or return expectations.',
      'Let people know the neighborhood and how to reach you.',
    ]"
    pending-label="Posting lending offer..."
    :security-error="securityError"
    :status="status"
    submit-label="Post lending offer"
    success-text="Posted. Your lending offer now appears on the live board, and you can delete it there later."
    title="Offer something useful so another person can reach out and borrow it."
    @submit="submit"
  >
    <label class="field">
      <span>Your name</span>
      <input autocomplete="name" name="name" placeholder="Jane Smith" required type="text">
    </label>

    <label class="field">
      <span>Email or phone</span>
      <input autocomplete="email" name="contact" placeholder="jane@email.com or 555-123-4567" required type="text">
    </label>

    <label class="field field--wide">
      <span>Item available to lend</span>
      <input name="item_available" placeholder="Cordless drill, bundt pan, pruning shears, history book set..." required type="text">
    </label>

    <label class="field">
      <span>Neighborhood</span>
      <input name="neighborhood" placeholder="Where pickup can happen" required type="text">
    </label>

    <label class="field">
      <span>Availability</span>
      <input name="availability" placeholder="Weeknights, weekends, most afternoons..." required type="text">
    </label>

    <label class="field">
      <span>Condition or notes</span>
      <input name="condition" placeholder="New, gently used, heavy, fragile..." required type="text">
    </label>

    <label class="field field--wide">
      <span>Borrowing guidelines</span>
      <textarea name="guidelines" placeholder="Let people know how long they can borrow the item, whether you need a text before pickup, and anything else they should respect." required rows="6" />
    </label>
  </BoardSubmissionPage>
</template>
