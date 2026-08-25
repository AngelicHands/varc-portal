import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const VideoIcon = memo(({ className, ...props }: SvgProps) => {
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
        d="M2 5C2 3.34315 3.34315 2 5 2H14C15.6569 2 17 3.34315 17 5V7.382L20.4472 5.2764C20.786 5.07061 21.2042 5.05334 21.5583 5.2305C21.9124 5.40767 22.15 5.76628 22.15 6.16V17.84C22.15 18.2337 21.9124 18.5923 21.5583 18.7695C21.2042 18.9467 20.786 18.9294 20.4472 18.7236L17 16.618V19C17 20.6569 15.6569 22 14 22H5C3.34315 22 2 20.6569 2 19V5ZM15 5C15 4.44772 14.5523 4 14 4H5C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H14C14.5523 20 15 19.5523 15 19V5ZM17 14.1464L20.15 16.0364V7.96359L17 9.85359V14.1464Z"
        fill="currentColor"
      />
    </svg>
  )
})

VideoIcon.displayName = "VideoIcon"
