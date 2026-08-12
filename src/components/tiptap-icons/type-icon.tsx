import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TypeIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M4 5C4 4.44772 4.44772 4 5 4H19C19.5523 4 20 4.44772 20 5C20 5.55228 19.5523 6 19 6H13V19C13 19.5523 12.5523 20 12 20C11.4477 20 11 19.5523 11 19V6H5C4.44772 6 4 5.55228 4 5Z"
        fill="currentColor"
      />
    </svg>
  )
})

TypeIcon.displayName = "TypeIcon"
