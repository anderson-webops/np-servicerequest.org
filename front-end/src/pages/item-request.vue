<script setup lang="ts">
import { useBoardSubmission } from '~/composables/useBoardSubmission'

definePageMeta({
  layout: 'home',
})

useSeoMeta({
  title: 'Request an item',
  description: 'Post an item request to the community board for something you want to borrow, such as a tool, book, or kitchen item.',
})

const { loadBootstrap, securityError, status, submit } = useBoardSubmission('itemRequest')

onMounted(() => {
  void loadBootstrap()
})
</script>

<template>
  <BoardSubmissionPage
    description="This page is for practical item requests such as an axe, a kitchen utensil, a certain book, a ladder, or another short-term household need."
    eyebrow="Request an item"
    :examples="[
      'Name the exact item if you can.',
      'Say how long you expect to borrow it.',
      'Include whether you can pick it up yourself or need help getting it.',
    ]"
    pending-label="Posting item request..."
    :security-error="securityError"
    :status="status"
    submit-label="Post item request"
    success-text="Posted. Your item request now appears on the live board. If you used an email address, a management link was sent there so you can delete it later from another browser."
    title="Ask for something specific that you want to borrow."
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
      <span>Item needed</span>
      <input name="item_needed" placeholder="Axe, stock pot, cookbook, drill, folding table..." required type="text">
    </label>

    <label class="field">
      <span>Need it by</span>
      <input name="needed_by" type="date">
    </label>

    <label class="field">
      <span>How long will you need it?</span>
      <input name="duration" placeholder="A day, a weekend, two weeks..." required type="text">
    </label>

    <label class="field">
      <span>Pickup plan</span>
      <select name="pickup_plan" required>
        <option value="">
          Select one
        </option>
        <option>I can pick it up</option>
        <option>I may need drop-off help</option>
        <option>I am flexible</option>
      </select>
    </label>

    <label class="field">
      <span>Your neighborhood</span>
      <input name="neighborhood" placeholder="Where you are located" required type="text">
    </label>

    <label class="field field--wide">
      <span>Details</span>
      <textarea name="details" placeholder="Share any size, edition, quantity, or use-case details that would help a lender know whether they have the right item." required rows="6" />
    </label>
  </BoardSubmissionPage>
</template>
