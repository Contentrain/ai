// When the contact section has nothing to show. Its form is drawn only where a home for it exists (Studio bound, the
// WordPress page known, a service address that is https); until then the section stands on its heading, introduction
// and details. The source's words are never dropped with the form: a page whose contact section holds only a heading
// ("Bize yazın") keeps it, because the text is the site's own and a fidelity gate compares it. Only a section with no
// heading, introduction or details at all — nothing to print — is left out, and appears with its form once it has a home.

export function contactSectionBare(input: { formShown: boolean, heading?: string | undefined, intro?: string | undefined, details?: readonly unknown[] | undefined }): boolean {
  return !input.formShown && !input.heading && !input.intro && !(input.details?.length ?? 0)
}
