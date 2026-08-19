import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignVerticalBottomIcon = memo(
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
        <path d="M7 10C6.44772 10 6 10.4477 6 11C6 11.5523 6.44772 12 7 12H16C16.5523 12 17 11.5523 17 11C17 10.4477 16.5523 10 16 10H7Z" fill="currentColor" />
        <path d="M7 13C6.44772 13 6 13.4477 6 14C6 14.5523 6.44772 15 7 15H15C15.5523 15 16 14.5523 16 14C16 13.4477 15.5523 13 15 13H7Z" fill="currentColor" />
        <path d="M7 16C6.44772 16 6 16.4477 6 17C6 17.5523 6.44772 18 7 18H17C17.5523 18 18 17.5523 18 17C18 16.4477 17.5523 16 17 16H7Z" fill="currentColor" />
      </svg>
    )
  },
)

AlignVerticalBottomIcon.displayName = "AlignVerticalBottomIcon"
