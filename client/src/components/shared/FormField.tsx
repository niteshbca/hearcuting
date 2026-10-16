import type { ReactNode } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  description?: string;
  required?: boolean;
  rules?: Omit<RegisterOptions<TFieldValues, TName>, "valueAsNumber" | "valueAsDate" | "setValueAs">;
  className?: string;
  render: (field: ControllerRenderProps<TFieldValues, TName>) => ReactNode;
}

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  description,
  required,
  rules,
  className,
  render,
}: FormFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => {
        const errorId = `${name}-error`;
        const descId = `${name}-desc`;
        return (
          <div className={cn("grid gap-1.5", className)}>
            {label && (
              <Label htmlFor={name} className={cn(fieldState.error && "text-danger")}>
                {label}
                {required && <span className="ml-0.5 text-gold-dark">*</span>}
              </Label>
            )}
            {render(field)}
            {description && !fieldState.error && (
              <p id={descId} className="text-xs text-ink-400">
                {description}
              </p>
            )}
            {fieldState.error && (
              <p id={errorId} role="alert" className="text-xs font-medium text-danger">
                {fieldState.error.message}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
