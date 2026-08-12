use dc34_api::*;
use num_traits::ToPrimitive;
use std::sync::atomic::{AtomicBool, Ordering};

/// When set, this thread stops asserting the LED pattern (e.g. during a camera scan).
pub static MOTION_PAUSE: AtomicBool = AtomicBool::new(false);
pub fn set_pause(p: bool) {
    MOTION_PAUSE.store(p, Ordering::SeqCst);
}

/// Drives the default LED show: a dot races around the ring, then the whole ring flashes, repeat.
///
/// IMPORTANT: this does NOT touch the accelerometer -- that belongs to the power manager
/// (`power.rs`), which arms its motion interrupt to wake from sleep. Sharing it broke sleep/wake.
/// So this is a pure LED driver: it only sends phenotypes to the LED server.
pub fn start_motion() {
    std::thread::spawn(move || {
        led_show();
    });
}

fn led_show() {
    let xns = xous_names::XousNames::new().unwrap();
    let tt = ticktimer::Ticktimer::new().unwrap();
    let led = xns.request_connection_blocking(dc34_api::LED_SERVER).unwrap();

    // let the system + vault finish booting (and send their initial gene) first
    tt.sleep_ms(5000).ok();

    // SEIZURE STROBE: brightness on this badge is ONLY the BIO's smooth value wave (there is no
    // static brightness byte in the gene), and that wave is capped at ~1s -- so a clean bright/dark
    // strobe can't go faster. Instead we hammer the *color* directly at ~12 Hz: force() lands on the
    // strip's very next refresh, so flipping between full-bright contrasting colors every ~80ms reads
    // as a rapid rave strobe. Each frame is uniform (cd_period 0), no chase (chaser 255), full sat.
    let frame = |sat: u8, hue: u8| {
        Haploid {
            cd_period: 0,
            cd_rate: 0,      // fastest underlying wave; color is what we're actually strobing
            cd_dir: 200,
            sat,
            hue_ratedir: 0,  // hold hue steady within a frame -- WE change it each frame
            hue_base: hue,
            hue_bound: 255,
            chaser: 255,     // no chase dot
            nonlin: 220,     // max contrast
        }
        .serialize_u32()
    };
    // white, red, green, blue, orange, magenta -> jarring, high-contrast cycle
    let frames: [[u32; 4]; 6] =
        [frame(0, 0), frame(255, 0), frame(255, 85), frame(255, 170), frame(255, 43), frame(255, 213)];

    let force = |a: &[u32; 4]| {
        xous::send_message(
            led,
            xous::Message::new_scalar(
                dc34_api::LedManagerOp::Force.to_usize().unwrap(),
                a[0] as usize,
                a[1] as usize,
                a[2] as usize,
                a[3] as usize,
            ),
        )
        .ok();
    };

    // ANIMATION SPEED: milliseconds per color flip. 80ms is the proven-stable rate (very fast rates
    // like 18ms flooded the LED FIFO and could wedge the LED server during boot). Keep >= ~60.
    const FLIP_MS: usize = 80;
    let mut i = 0usize;
    loop {
        if MOTION_PAUSE.load(Ordering::SeqCst) {
            tt.sleep_ms(100).ok();
            continue; // paused (camera scan) -> leave the LEDs alone
        }
        force(&frames[i % frames.len()]);
        i = i.wrapping_add(1);
        tt.sleep_ms(FLIP_MS).ok();
    }
}
