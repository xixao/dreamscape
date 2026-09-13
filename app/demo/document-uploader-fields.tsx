"use client";
import { Fragment, useId } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { configSchema } from "@/lib/demo/upload-schema";
import type { UploadConfig } from "@/lib/demo/upload-schema";

export default function DocumentUploaderFields({
  value,
  onChange,
  variant = "review",
  idPrefix,
}: {
  value: UploadConfig;
  onChange: (config: UploadConfig) => void;
  variant?: "design" | "review";
  idPrefix?: string;
}) {
  const uniqueId = useId();
  const prefix = idPrefix ?? uniqueId;
  return (
    <>
      {(
        [
          ["title", "Heading"],
          ["helper", "Supporting text"],
          ["error", "Error message"],
          ["button", "Upload button"],
        ] as const
      ).map(([key, label]) => {
        const Field = key === "helper" || key === "error" ? Textarea : Input;
        const input = (
          <Field
            id={`${prefix}-${key}`}
            value={value[key]}
            maxLength={configSchema.shape[key].maxLength ?? undefined}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
        );
        return variant === "design" ? (
          <Fragment key={key}>
            <label htmlFor={`${prefix}-${key}`}>{label}</label>
            {input}
          </Fragment>
        ) : (
          <label key={key} htmlFor={`${prefix}-${key}`}>
            {label}
            {input}
          </label>
        );
      })}
      {(
        [
          ["retryEnabled", "Retry action"],
          ["announceError", "Announce error"],
        ] as const
      ).map(([key, label]) => (
        <label
          key={key}
          className={variant === "design" ? "design-check" : "switch-line"}
        >
          {variant === "review" && label}
          {variant === "design" ? (
            <Checkbox
              id={
                key === "retryEnabled"
                  ? `${prefix}-retry`
                  : `${prefix}-announce`
              }
              checked={value[key]}
              onCheckedChange={(checked) =>
                onChange({ ...value, [key]: checked === true })
              }
            />
          ) : (
            <Switch
              checked={value[key]}
              onCheckedChange={(checked) =>
                onChange({ ...value, [key]: checked })
              }
            />
          )}
          {variant === "design" && label}
        </label>
      ))}
    </>
  );
}
