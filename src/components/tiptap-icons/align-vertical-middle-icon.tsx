import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignVerticalMiddleIcon = memo(
  ({ className, ...props }: SvgProps) => {
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
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5 3C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5ZM5 5H19V19H5V5Z"
          fill="currentColor"
        />
        <path d="M7 9C6.44772 9 6 9.44772 6 10C6 10.5523 6.44772 11 7 11H17C17.5523 11 18 10.5523 18 10C18 9.44772 17.5523 9 17 9H7Z" fill="currentColor" />
        <path d="M7 12C6.44772 12 6 12.4477 6 13C6 13.5523 6.44772 14 7 14H15C15.5523 14 16 13.5523 16 13C16 12.4477 15.5523 12 15 12H7Z" fill="currentColor" />
        <path d="M7 15C6.44772 15 6 15.4477 6 16C6 16.5523 6.44772 17 7 17H16C16.5523 17 17 16.5523 17 16C17 15.4477 16.5523 15 16 15H7Z" fill="currentColor" />
      </svg>
    )
  },
)

AlignVerticalMiddleIcon.displayName = "AlignVerticalMiddleIcon"
