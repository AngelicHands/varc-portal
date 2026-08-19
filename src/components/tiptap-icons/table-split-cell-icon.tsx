import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const TableSplitCellIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M4 3C2.89543 3 2 3.89543 2 5V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V5C22 3.89543 21.1046 3 20 3H4ZM11 5H4V19H11V5ZM13 19V5H20V19H13Z"
        fill="currentColor"
      />
    </svg>
  )
})

TableSplitCellIcon.displayName = "TableSplitCellIcon"
