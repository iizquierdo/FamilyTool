# Project Rules

## UI Rule: Creation Forms

- All **creation** forms in the application must open inside a **modal dialog**.
- Do not render creation forms inline in pages, tabs, cards, or panels.
- Edit forms can be modal as well; for consistency, modal is the default pattern.

## Implementation Checklist

- Add a clear primary action button (for example: `Nuevo`, `Agregar`) that opens the modal.
- Keep background content visible but blocked while modal is open.
- Include explicit `Cancelar` and `Guardar/Crear` actions inside the modal.
- Close modal on successful save and refresh the related list/view.
