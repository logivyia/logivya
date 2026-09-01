"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, wrapperClassName, disabled, ...props }, ref) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    const label = t(visible ? "auth.hidePassword" : "auth.showPassword");

    return (
      <span className={cn("relative block", wrapperClassName)}>
        <input
          {...props}
          ref={ref}
          disabled={disabled}
          type={visible ? "text" : "password"}
          className={cn("pe-12", className)}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-pressed={visible}
          title={label}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 end-0 inline-flex min-w-11 items-center justify-center rounded-e-[inherit] text-slate-500 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </span>
    );
  },
);
