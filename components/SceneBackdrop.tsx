// 화면 전체 배경: 손그림 풍의 맑은 오후 언덕 장면 (그림 1장 + 같은 그림의 반복 영상)
// 장면은 그림과 영상만으로 움직이고, 코드로 그리거나 움직이는 것은 없다.
// 영상은 위아래를 거울로 늘려 정사각형으로 만든 것이라 높이 112.5%·top −6.25%로 겹쳐야 그림과 맞는다.
// 모션을 줄이는 설정이면 영상을 숨기고 그림만 보여 준다 (globals.css의 .scene).

const PLATE_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/3ca5d10d-ea2f-4907-876f-33bde169469e.jpg";
const MOTION_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/d2cb5bef-f92b-4e91-ae93-8dc6555e56ac.mp4";

export default function SceneBackdrop() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-box">
        {/* 배경 그림은 next/image의 크기 최적화가 필요 없는 장식이라 일반 img를 쓴다 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLATE_URL} alt="" />
        <video src={MOTION_URL} muted loop playsInline autoPlay preload="auto" disablePictureInPicture />
      </div>
    </div>
  );
}
