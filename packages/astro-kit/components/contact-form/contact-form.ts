// When the contact section has nothing to show. Its form is drawn only where a home for it exists (Studio bound, the
// WordPress page known, a service address that is https); until then the section stands on its heading, introduction
// and details. A section left with a heading ALONE titles a form that is not there — the page would print "Tell us about
// your project" over empty space — so it is not drawn at all, and appears with its form once the form has a home.

export function contactSectionBare(input: { formShown: boolean, intro?: string | undefined, details?: readonly unknown[] | undefined }): boolean {
  return !input.formShown && !input.intro && !(input.details?.length ?? 0)
}
