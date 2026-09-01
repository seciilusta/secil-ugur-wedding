"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { z } from "zod";
import { site } from "@/config/site";
import {
  fetchRsvpConfig,
  getSubmissionToken,
  RsvpError,
  submitRsvp,
  type Attendance,
  type RsvpResult,
} from "@/lib/rsvp-client";

const { labels, hints, messages, errors: copy, privacyNote } = site.rsvp;

type FormValues = {
  fullName: string;
  attendance: string;
  guestCount: string;
  note: string;
  /** Honeypot. Real guests never see or fill this. */
  website: string;
};

const EMPTY_FORM: FormValues = {
  fullName: "",
  attendance: "",
  guestCount: "",
  note: "",
  website: "",
};

/**
 * Guards against a fast double tap or double Enter landing two POSTs.
 *
 * Module scope rather than a ref: the page renders exactly one RSVP form, and a
 * plain variable is read and written synchronously inside the submit handler
 * with no chance of a stale value between renders. The disabled submit button
 * covers the ordinary case; this closes the window before React re-renders.
 */
let submissionInFlight = false;

/** Built per render of the max-guest limit so the message can quote the number. */
function buildSchema(maxGuests: number) {
  return z
    .object({
      fullName: z
        .string()
        .refine((value) => value.trim().length > 0, { error: copy.fullNameRequired })
        .refine((value) => value.trim().length === 0 || value.trim().length >= 2, {
          error: copy.fullNameTooShort,
        })
        .refine((value) => value.trim().length <= 120, { error: copy.fullNameTooLong }),
      attendance: z.string().refine((value) => value === "yes" || value === "no", {
        error: copy.attendanceRequired,
      }),
      guestCount: z.string(),
      note: z.string().refine((value) => value.trim().length <= 500, { error: copy.noteTooLong }),
      website: z.string(),
    })
    .superRefine((values, ctx) => {
      // Guest count only exists, and only matters, when the guest is attending.
      if (values.attendance !== "yes") return;

      if (values.guestCount.trim().length === 0) {
        ctx.addIssue({ code: "custom", path: ["guestCount"], message: copy.guestCountRequired });
        return;
      }

      const count = Number(values.guestCount);
      if (!Number.isInteger(count) || count < 1 || count > maxGuests) {
        ctx.addIssue({
          code: "custom",
          path: ["guestCount"],
          message: copy.guestCountRange.replace("{max}", String(maxGuests)),
        });
      }
    });
}

type FormError = { message: string; retryable: boolean };

export function RsvpForm() {
  const fieldId = useId();
  const reduceMotion = useReducedMotion();

  /**
   * Starts from `site.rsvp.maxGuests` so the form is usable immediately, then
   * defers to the API's authoritative `RSVP_MAX_GUESTS` once it answers.
   */
  const [maxGuests, setMaxGuests] = useState<number>(site.rsvp.maxGuests);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [result, setResult] = useState<RsvpResult | null>(null);
  const [hasSubmittedOnce, setHasSubmittedOnce] = useState(false);

  const schema = useMemo(() => buildSchema(maxGuests), [maxGuests]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: EMPTY_FORM,
    mode: "onTouched",
  });

  const attendance = useWatch({ control, name: "attendance" });
  const isAttending = attendance === "yes";

  useEffect(() => {
    let active = true;

    fetchRsvpConfig()
      .then((config) => {
        if (active) setMaxGuests(config.maxGuests);
      })
      .catch((error: unknown) => {
        // A missing or malformed runtime-config.json is worth telling the guest
        // about up front, because no submission can ever succeed. Anything else
        // (API asleep, flaky network) stays quiet until they actually submit.
        if (active && error instanceof RsvpError && error.kind === "config") {
          setFormError({ message: error.message, retryable: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  /** Drop any stale guest count the moment "Katılamayacağım" is chosen. */
  useEffect(() => {
    if (attendance === "no") {
      setValue("guestCount", "", { shouldValidate: false, shouldDirty: false });
      clearErrors("guestCount");
    }
  }, [attendance, setValue, clearErrors]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const willAttend: Attendance = values.attendance === "yes" ? "yes" : "no";

    try {
      const submitted = await submitRsvp({
        submissionToken: getSubmissionToken(),
        fullName: values.fullName,
        attendance: willAttend,
        // Not attending always reports zero, whatever the field last held.
        guestCount: willAttend === "yes" ? Number(values.guestCount) : 0,
        note: values.note,
        website: values.website,
      });

      setResult(submitted);
      setHasSubmittedOnce(true);
    } catch (error: unknown) {
      if (error instanceof RsvpError) {
        setFormError({ message: error.message, retryable: error.kind !== "config" });
      } else {
        setFormError({ message: copy.server, retryable: true });
      }
    }
  });

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 0.61, 0.36, 1] as const };

  /* ------------------------------------------------------------- success */

  if (result) {
    const successMessage =
      result.status === "updated"
        ? messages.successUpdated
        : result.attendance === "yes"
          ? messages.successAttending
          : messages.successNotAttending;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="success"
          initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          role="status"
          aria-live="polite"
          className="border-t border-champagne/50 pt-8"
        >
          <p className="font-display text-quote text-on-olive text-pretty-tr">{successMessage}</p>
          <p className="mt-5 text-body text-on-olive-muted text-pretty-tr">{messages.successFootnote}</p>

          <button
            type="button"
            onClick={() => {
              setResult(null);
              setFormError(null);
            }}
            className="tap-target mt-7 inline-flex items-center border-b border-on-olive-muted/60 pb-1 text-fine tracking-label text-on-olive uppercase transition-colors duration-500 hover:border-champagne hover:text-champagne"
          >
            {messages.editAgain}
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  /* ---------------------------------------------------------------- form */

  const guestCountId = `${fieldId}-guest-count`;
  const submitLabel = isSubmitting ? labels.submitting : hasSubmittedOnce ? labels.update : labels.submit;

  return (
    <form
      onSubmit={(event) => {
        if (submissionInFlight) {
          event.preventDefault();
          return;
        }
        submissionInFlight = true;
        void onSubmit(event).finally(() => {
          submissionInFlight = false;
        });
      }}
      noValidate
      className="border-t border-olive-line/50 pt-8"
    >
      {/* ------------------------------------------------------- full name */}
      <div>
        <label htmlFor={`${fieldId}-full-name`} className="field-label">
          {labels.fullName}
        </label>
        <input
          id={`${fieldId}-full-name`}
          type="text"
          autoComplete="name"
          enterKeyHint="next"
          className="field-input"
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? `${fieldId}-full-name-error` : `${fieldId}-full-name-hint`}
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p id={`${fieldId}-full-name-error`} role="alert" className="field-error">
            {errors.fullName.message}
          </p>
        ) : (
          <p id={`${fieldId}-full-name-hint`} className="field-hint">
            {hints.fullName}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ attendance */}
      <fieldset className="mt-9">
        <legend className="field-label">{labels.attendance}</legend>
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-describedby={errors.attendance ? `${fieldId}-attendance-error` : undefined}
        >
          {(
            [
              { value: "yes", label: labels.attending },
              { value: "no", label: labels.notAttending },
            ] as const
          ).map((option) => (
            <div key={option.value}>
              <input
                id={`${fieldId}-attendance-${option.value}`}
                type="radio"
                value={option.value}
                className="choice-input sr-only"
                {...register("attendance")}
              />
              <label htmlFor={`${fieldId}-attendance-${option.value}`} className="choice">
                {option.label}
              </label>
            </div>
          ))}
        </div>
        {errors.attendance ? (
          <p id={`${fieldId}-attendance-error`} role="alert" className="field-error">
            {errors.attendance.message}
          </p>
        ) : null}
      </fieldset>

      {/* ----------------------------------------------------- guest count */}
      <AnimatePresence initial={false}>
        {isAttending ? (
          <motion.div
            key="guest-count"
            initial={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="mt-9">
              <label htmlFor={guestCountId} className="field-label">
                {labels.guestCount}
              </label>
              <select
                id={guestCountId}
                className="field-input"
                aria-invalid={errors.guestCount ? true : undefined}
                aria-describedby={errors.guestCount ? `${guestCountId}-error` : `${guestCountId}-hint`}
                {...register("guestCount")}
              >
                <option value="">—</option>
                {Array.from({ length: maxGuests }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
              {errors.guestCount ? (
                <p id={`${guestCountId}-error`} role="alert" className="field-error">
                  {errors.guestCount.message}
                </p>
              ) : (
                <p id={`${guestCountId}-hint`} className="field-hint">
                  {hints.guestCount}
                </p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ------------------------------------------------------------ note */}
      <div className="mt-9">
        <label htmlFor={`${fieldId}-note`} className="field-label">
          {labels.note}
        </label>
        <textarea
          id={`${fieldId}-note`}
          rows={3}
          className="field-input"
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? `${fieldId}-note-error` : `${fieldId}-note-hint`}
          {...register("note")}
        />
        {errors.note ? (
          <p id={`${fieldId}-note-error`} role="alert" className="field-error">
            {errors.note.message}
          </p>
        ) : (
          <p id={`${fieldId}-note-hint`} className="field-hint">
            {hints.note}
          </p>
        )}
      </div>

      {/* --------------------------------------------------------- honeypot
          Off-screen rather than display:none, which some bots skip, and hidden
          from assistive technology and the tab order. */}
      <div aria-hidden className="pointer-events-none absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${fieldId}-website`}>Web sitesi</label>
        <input
          id={`${fieldId}-website`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      {/* -------------------------------------------------------- submission */}
      {formError ? (
        <div role="alert" className="mt-9 border-l border-amber/70 pl-5">
          <p className="text-body text-on-olive text-pretty-tr">{formError.message}</p>
        </div>
      ) : null}

      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="submit" className="submit-button" disabled={isSubmitting}>
          {formError?.retryable && !isSubmitting ? copy.retry : submitLabel}
        </button>
        {isSubmitting ? (
          <span aria-hidden className="text-fine text-on-olive-muted">
            {labels.submitting}
          </span>
        ) : null}
      </div>

      <p className="mt-8 max-w-[46ch] text-fine text-on-olive-muted text-pretty-tr">{privacyNote}</p>
    </form>
  );
}
