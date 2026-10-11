import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mac No Mouse | choxi",
};

export default function Post() {
  return (
    <div className="post">
      <h1 className="spc-n-zero">
        Mac No Mouse - Coding at the Speed of Thought
      </h1>
      <p>
        There was a great lightning talk I went to at RailsConf many years ago
        where the topic was how to use your Mac without a mouse. The
        presentation was about how just the small amount of time it takes to
        switch from your keyboard to your mouse or trackpad is enough to break
        your flow state when you're coding, and learning how to use your Mac
        without a mouse allows you to work closer to the "speed of thought." The
        idea is that this isn't just a marginal improvement to your speed,
        there's a qualitative difference between waiting for your hands to catch
        up with your thoughts versus both of them working at the same speed.
      </p>
      <p>
        The speaker had a website called "Mac No Mouse" which I can't seem to
        find anymore, but it was such a great resource to me so I thought I'd
        share my own notes on using a Mac without a mouse.
      </p>
      <h2>Window Management</h2>
      <p>Use CMD+Tab to switch apps</p>
      <p>CMD+~ to switch between windows of an app</p>
      <p>
        Rectangle / Apple Default Window Manager. There are a lot of options
        that let you move windows to the a corner, or left/right split, or full
        screen.
      </p>
      <p>CTRL+Up to open Mission Control (see all open windows)</p>
      <p>CTRL+Down to view all open windows for the current application</p>
      <h2>Controls</h2>
      <p>
        Turn on accessibility settings so you can use tab and space to interact
        with dialogs
      </p>
      <p>Tab to change focus</p>
      <p>Spotlight Search</p>
      <h2>Text</h2>
      <p>Multi-paste (Maccy)</p>
      <p>Text Editing Shorcuts (cmd/option + arrow keys)</p>
      <p>Vimium/Vimari/Homerow</p>
    </div>
  );
}
